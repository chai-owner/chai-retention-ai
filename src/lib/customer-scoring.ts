// Pure server-side scoring maths for the daily customer scoring job.
// Deliberately independent of the client-side scoring path (real-scoring.ts):
// this produces the stored `customer_scores` snapshot and changes nothing the
// app already computes in the browser.
//
// Scoring is baseline-relative: each customer is compared against their own
// recent history (from previous `customer_scores` rows) rather than against
// whoever happens to be best or worst in the cohort today. Cohort min-max is
// kept as the no-history fallback.
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { resolveMetric } from "@/lib/metric-resolution";

export type RiskLevel = "healthy" | "at-risk" | "critical";

export type ScoreBasis = "baseline-30d" | "baseline-90d" | "horizon" | "cohort";

export interface ScoreBreakdownEntry {
  metric: string;
  value: number;
  normalised: number;
  weight: number;
  basis: ScoreBasis;
  baseline: number | null;
}

export interface CustomerScore {
  customer_id: string;
  score: number;
  risk_level: RiskLevel;
  score_breakdown: ScoreBreakdownEntry[];
}

/** One historical metric observation, read back from `customer_scores`. */
export interface HistoryPoint {
  customer_id: string;
  metric: string;
  value: number;
  scored_at: number; // ms since epoch
}

export interface ScoringOptions {
  history?: HistoryPoint[];
  /** profiles.cadence — free text describing how often customers buy/engage. */
  cadence?: string;
  /** profiles.lifespan — free text describing expected customer lifetime. */
  lifespan?: string;
  now?: number;
}

const DAY = 86_400_000;
const DEFAULT_HORIZON_DAYS = 180;

export function riskLevelFor(score: number): RiskLevel {
  if (score >= 70) return "healthy";
  if (score >= 40) return "at-risk";
  return "critical";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function metricText(metric: PlannerMetric): string {
  return [metric.name, metric.why, metric.churn, metric.reason, metric.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** True when the metric measures elapsed time since an event ("days since last…"). */
export function isElapsedMetric(metric: PlannerMetric): boolean {
  return /(days?|weeks?|months?)\s+since|time since|last (purchase|payment|order|visit|login|contact|session|interaction)|inactiv|dormant|ghost|lapse/.test(
    metricText(metric),
  );
}

/**
 * Direction of "good" for a metric. Explicit display anchors win; otherwise it
 * is inferred from the category and wording — elapsed-time, cost, complaint and
 * transaction-recency language means lower is better, while engagement and
 * retention language means higher is better.
 */
export function metricDirection(metric: PlannerMetric): "higher" | "lower" {
  if (metric.valueAt0 != null && metric.valueAt100 != null) {
    return metric.valueAt0 > metric.valueAt100 ? "lower" : "higher";
  }
  const text = metricText(metric);
  const category = (metric.category ?? "").toLowerCase();
  if (isElapsedMetric(metric)) return "lower";
  if (/overdue|late|delay|complaint|escalation|churn|cancel|refund|failure|backlog|wait|ticket volume|downtime|defect/.test(text)) {
    return "lower";
  }
  if (category === "engagement" || category === "retention" || category === "satisfaction") return "higher";
  if (category === "support") return "lower";
  // Transactions is recency/obligation heavy in practice; only treat it as
  // lower-is-better when there is no clear "more is better" value language.
  if (category === "transactions") {
    return /revenue|value|spend|amount|frequency|depth|penetration|volume of purchases|renewal/.test(text)
      ? "higher"
      : "lower";
  }
  return "higher";
}

const CADENCE_UNITS: Array<[RegExp, number]> = [
  [/\bday(s)?\b/, 1],
  [/\bweek(s)?\b/, 7],
  [/\bmonth(s)?\b/, 30],
  [/\bquarter(s)?\b/, 91],
  [/\byear(s)?\b|\bannual/, 365],
];

const CADENCE_WORDS: Array<[RegExp, number]> = [
  [/\bdaily\b|every day|monday to friday|weekday/, 1],
  [/\bweekly\b|每|each week/, 7],
  [/\bfortnight|bi-?weekly\b/, 14],
  [/\bmonthly\b/, 30],
  [/\bquarterly\b/, 91],
  [/\bannually\b|\byearly\b/, 365],
];

function parseDurationDays(text: string): number | null {
  const lower = text.toLowerCase();
  const numeric = lower.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (numeric) {
    const amount = Number(numeric[1]);
    for (const [pattern, days] of CADENCE_UNITS) {
      if (pattern.test(numeric[2] ?? "")) return amount * days;
    }
  }
  for (const [pattern, days] of CADENCE_WORDS) {
    if (pattern.test(lower)) return days;
  }
  return null;
}

/**
 * How many days of silence should score a customer at zero for elapsed-time
 * metrics. Derived from the account's stated purchase cadence (three cadence
 * periods of silence = fully lapsed) and, failing that, from expected customer
 * lifespan. Falls back to 180 days when the profile says nothing usable.
 */
export function horizonDays(cadence?: string, lifespan?: string): number {
  const cadenceDays = cadence ? parseDurationDays(cadence) : null;
  if (cadenceDays != null && cadenceDays > 0) {
    return Math.max(7, Math.min(365, Math.round(cadenceDays * 3)));
  }
  const lifespanDays = lifespan ? parseDurationDays(lifespan) : null;
  if (lifespanDays != null && lifespanDays > 0) {
    return Math.max(14, Math.min(365, Math.round(lifespanDays / 10)));
  }
  return DEFAULT_HORIZON_DAYS;
}

/** Average of a customer's observations for a metric inside a day window. */
function baselineFor(
  points: HistoryPoint[] | undefined,
  now: number,
  windowDays: number,
): number | null {
  if (!points || points.length === 0) return null;
  const cutoff = now - windowDays * DAY;
  const inWindow = points.filter((p) => p.scored_at >= cutoff && Number.isFinite(p.value));
  if (inWindow.length === 0) return null;
  return inWindow.reduce((sum, p) => sum + p.value, 0) / inWindow.length;
}

/** Score a value against the customer's own baseline; baseline itself sits at 50. */
function scoreAgainstBaseline(value: number, baseline: number, direction: "higher" | "lower"): number {
  if (direction === "lower") {
    if (value <= 0) return 100;
    if (baseline <= 0) return value <= 0 ? 100 : 0;
    return clamp(50 * (baseline / value));
  }
  if (baseline <= 0) return value > 0 ? 100 : 50;
  return clamp(50 * (value / baseline));
}

/**
 * Scores every customer in `data.customers` against `metrics`.
 *
 * Per metric, per customer, in order of preference:
 *  1. the customer's own 30-day average from `customer_scores`
 *  2. their 90-day average when 30 days of history is not there yet
 *  3. a cadence-derived horizon for elapsed-time metrics ("days since last…")
 *  4. cohort min-max across today's customer base (the original behaviour)
 *
 * Each normalised value is weighted by the metric's `weight` (default 1) and
 * averaged into a 0–100 health score.
 */
export function scoreCustomers(
  metrics: PlannerMetric[],
  data: IngestedData,
  options: ScoringOptions = {},
): CustomerScore[] {
  const now = options.now ?? Date.now();
  const horizon = horizonDays(options.cadence, options.lifespan);

  const customerIds = [
    ...new Set(
      (data.customers ?? [])
        .map((row) => String(row.customer_id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (customerIds.length === 0 || metrics.length === 0) return [];

  // history indexed by "customerId\u0000metricName"
  const history = new Map<string, HistoryPoint[]>();
  for (const point of options.history ?? []) {
    const key = `${point.customer_id}\u0000${point.metric}`;
    const bucket = history.get(key);
    if (bucket) bucket.push(point);
    else history.set(key, [point]);
  }

  const resolved = metrics.map((metric) => {
    const result = resolveMetric(metric, data, now);
    const values = [...result.values.values()];
    return {
      metric,
      values: result.values,
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      direction: metricDirection(metric),
      elapsed: isElapsedMetric(metric),
    };
  });

  return customerIds.map((customerId) => {
    const breakdown: ScoreBreakdownEntry[] = [];
    let weighted = 0;
    let totalWeight = 0;

    for (const entry of resolved) {
      const value = entry.values.get(customerId);
      if (value == null || !Number.isFinite(value)) continue;
      const weight = Number(entry.metric.weight ?? 1) || 1;
      const points = history.get(`${customerId}\u0000${entry.metric.name}`);

      let normalised: number;
      let basis: ScoreBasis;
      let baseline: number | null = baselineFor(points, now, 30);

      if (baseline != null) {
        basis = "baseline-30d";
        normalised = scoreAgainstBaseline(value, baseline, entry.direction);
      } else if ((baseline = baselineFor(points, now, 90)) != null) {
        basis = "baseline-90d";
        normalised = scoreAgainstBaseline(value, baseline, entry.direction);
      } else if (entry.elapsed) {
        basis = "horizon";
        normalised = clamp(100 - (value / horizon) * 100);
      } else {
        basis = "cohort";
        const spread = entry.max - entry.min;
        // A flat distribution carries no signal — treat everyone as mid-range.
        normalised = spread === 0 ? 50 : ((value - entry.min) / spread) * 100;
        if (entry.direction === "lower") normalised = 100 - normalised;
        normalised = clamp(normalised);
      }

      normalised = clamp(round(normalised));
      breakdown.push({
        metric: entry.metric.name,
        value: round(value),
        normalised,
        weight,
        basis,
        baseline: baseline == null ? null : round(baseline),
      });
      weighted += normalised * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? round(weighted / totalWeight) : 0;
    return {
      customer_id: customerId,
      score,
      risk_level: riskLevelFor(score),
      score_breakdown: breakdown,
    };
  });
}
