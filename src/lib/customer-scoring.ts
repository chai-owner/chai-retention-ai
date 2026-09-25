// Pure server-side scoring maths for the daily customer scoring job.
// Deliberately independent of the client-side scoring path (real-scoring.ts):
// this produces the stored `customer_scores` snapshot and changes nothing the
// app already computes in the browser.
//
// Scoring is baseline-relative: each customer is compared against their own
// history, worked out from their dated records (see personal-baseline.ts —
// the same logic the in-app score uses). Customers with too little history
// fall back to a cadence horizon or today's cohort, blended in while thin.
import {
  blendScore,
  compareRhythm,
  compareTrend,
  describeComparison,
} from "@/lib/personal-baseline";
import { withCountableTransactions } from "@/lib/countable-transactions";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { resolveMetric } from "@/lib/metric-resolution";
import {
  CHURN_HORIZON_DAYS,
  churnConfidenceFor,
  dataSourceFor,
  churnProbabilityFromHealth,
  type ChurnConfidence,
} from "@/lib/churn-probability";
import {
  PAYMENT_HEALTH_METRIC,
  PAYMENT_HEALTH_WEIGHT,
  maxDaysOverdueByCustomer,
  paymentHealthScore,
} from "@/lib/payment-health";

export type RiskLevel = "healthy" | "at-risk" | "critical";

export type ScoreBasis =
  /** Judged against this customer's own history (enough of it to trust). */
  | "personal"
  /** Thin personal history, mixed with the horizon/cohort fallback. */
  | "blended"
  /** Legacy stored rows only — no longer produced. */
  | "baseline-30d"
  | "baseline-90d"
  | "horizon"
  | "cohort"
  | "payment"
  /** AI-detected conversation signals (see content-signals/scoring.ts). */
  | "content";

export interface ScoreBreakdownEntry {
  metric: string;
  value: number;
  normalised: number;
  weight: number;
  basis: ScoreBasis;
  /** Personal comparisons: the customer's own normal (value or usual gap). */
  baseline: number | null;
  /** Plain-language reason naming the comparison used, when personal. */
  comparison?: string;
}

/**
 * Sentinel entry appended to `score_breakdown` so the churn probability and its
 * confidence are stored historically alongside the metric contributions. It
 * carries no numeric `value`, so metric consumers skip it.
 */
export const CHURN_META_METRIC = "__churn__";

export interface ChurnMetaEntry {
  metric: typeof CHURN_META_METRIC;
  churn_probability: number;
  churn_horizon_days: number;
  confidence: ChurnConfidence;
  data_categories: number;
}

export function isChurnMeta(entry: unknown): entry is ChurnMetaEntry {
  return (
    !!entry &&
    typeof entry === "object" &&
    (entry as { metric?: unknown }).metric === CHURN_META_METRIC
  );
}

/** Reads the stored churn meta out of a `score_breakdown` array, if present. */
export function churnMetaOf(breakdown: unknown): ChurnMetaEntry | null {
  if (!Array.isArray(breakdown)) return null;
  return (breakdown.find(isChurnMeta) as ChurnMetaEntry | undefined) ?? null;
}

export interface CustomerScore {
  customer_id: string;
  score: number;
  risk_level: RiskLevel;
  churn_probability: number;
  churn_confidence: ChurnConfidence;
  score_breakdown: Array<ScoreBreakdownEntry | ChurnMetaEntry>;
}


/** One historical metric observation, read back from `customer_scores`. */
export interface HistoryPoint {
  customer_id: string;
  metric: string;
  value: number;
  scored_at: number; // ms since epoch
}

export interface ScoringOptions {
  /** @deprecated Ignored — personal baselines now come from dated records. */
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

/** Noun used in reason text: "days since last deal" → "deal". */
function subjectFor(name: string, kind: "trend" | "rhythm" | undefined): string {
  const n = name.trim();
  if (kind === "rhythm") {
    const m = n.match(/since\s+(?:the\s+)?(?:last|most recent)\s+(.+)$/i);
    return (m?.[1] ?? "recorded activity").toLowerCase();
  }
  return n.toLowerCase();
}

/**
 * Scores every customer in `data.customers` against `metrics`.
 *
 * Per metric, per customer, in order of preference:
 *  1. their own history from dated records: last 30 days vs the prior 90
 *     (values, counts, rates) or their usual gap ("days since last …")
 *  2. blended with 3/4 while that history is thin
 *  3. a cadence-derived horizon for elapsed-time metrics ("days since last…")
 *  4. cohort min-max across today's customer base
 *
 * Each normalised value is weighted by the metric's `weight` (default 1) and
 * averaged into a 0–100 health score.
 */
export function scoreCustomers(
  metrics: PlannerMetric[],
  rawData: IngestedData,
  options: ScoringOptions = {},
): CustomerScore[] {
  // Open and lost CRM deals are not sales.
  const data = withCountableTransactions(rawData);
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
      operation: result.operation,
      series: result.series,
      // Which data SOURCE this metric draws on (transactions, support, usage,
      // surveys…) — the confidence indicator counts distinct sources, so two
      // metrics from the same source never inflate it.
      category: dataSourceFor(result.dataset),
    };
  });

  // Overdue invoices (Xero/QuickBooks) score as their own high-weight metric.
  const overdueByCustomer = maxDaysOverdueByCustomer(
    data.transactions as Array<Record<string, unknown>> | undefined,
    now,
  );
  const hasPaymentSignal = overdueByCustomer.size > 0;

  const scores: CustomerScore[] = [];
  for (const customerId of customerIds) {
    const breakdown: Array<ScoreBreakdownEntry | ChurnMetaEntry> = [];
    const categories = new Set<string>();
    let weighted = 0;
    let totalWeight = 0;

    for (const entry of resolved) {

      const value = entry.values.get(customerId);
      if (value == null || !Number.isFinite(value)) continue;
      const weight = Number(entry.metric.weight ?? 1) || 1;

      let normalised: number;
      let basis: ScoreBasis;
      let baseline: number | null = null;
      let comparison: string | null = null;

      // Fallback first: what today's scoring would say without the
      // customer's own history.
      let fallback: number;
      let fallbackBasis: ScoreBasis;
      if (entry.elapsed) {
        fallbackBasis = "horizon";
        fallback = clamp(100 - (value / horizon) * 100);
      } else {
        fallbackBasis = "cohort";
        const spread = entry.max - entry.min;
        // A flat distribution carries no signal — treat everyone as mid-range.
        let n = spread === 0 ? 50 : ((value - entry.min) / spread) * 100;
        if (entry.direction === "lower") n = 100 - n;
        fallback = clamp(n);
      }

      // Then this customer's own history: recent-vs-normal trend, or their
      // usual rhythm for "days since last …" metrics.
      const points = entry.series?.get(customerId);
      const personal =
        entry.operation === "days_since_last"
          ? compareRhythm(points?.map((p) => p.date), now)
          : entry.operation === "average" || entry.operation === "sum" || entry.operation === "ratio"
            ? compareTrend(points, entry.operation, entry.direction, now)
            : null;
      const blended = blendScore(personal, fallback);
      normalised = blended.score;
      if (blended.basis === "fallback") {
        basis = fallbackBasis;
      } else {
        basis = blended.basis;
        baseline = personal ? personal.normal : null;
        comparison = describeComparison(personal, blended.basis, subjectFor(entry.metric.name, personal?.kind));
      }

      normalised = clamp(round(normalised));
      breakdown.push({
        metric: entry.metric.name,
        value: round(value),
        normalised,
        weight,
        basis,
        baseline: baseline == null ? null : round(baseline),
        ...(comparison ? { comparison } : {}),
      });
      if (entry.category) categories.add(entry.category);
      weighted += normalised * weight;
      totalWeight += weight;
    }

    if (hasPaymentSignal) {
      const days = overdueByCustomer.get(customerId) ?? 0;
      const normalised = clamp(round(paymentHealthScore(days)));
      breakdown.push({
        metric: PAYMENT_HEALTH_METRIC,
        value: days,
        normalised,
        weight: PAYMENT_HEALTH_WEIGHT,
        basis: "payment",
        baseline: null,
      });
      categories.add("transactions"); // overdue invoices come from the invoice data
      weighted += normalised * PAYMENT_HEALTH_WEIGHT;
      totalWeight += PAYMENT_HEALTH_WEIGHT;
    }

    // No behavioural signal for this account → omit it rather than writing a
    // fabricated score. A hard 0 would read as "critical" in the daily brief
    // and digest when the honest answer is "we don't know yet".
    if (totalWeight === 0) continue;

    const score = round(weighted / totalWeight);
    const churnProbability = churnProbabilityFromHealth(score);
    const confidence = churnConfidenceFor(categories.size);
    breakdown.push({
      metric: CHURN_META_METRIC,
      churn_probability: churnProbability,
      churn_horizon_days: CHURN_HORIZON_DAYS,
      confidence,
      data_categories: categories.size,
    });
    scores.push({
      customer_id: customerId,
      score,
      risk_level: riskLevelFor(score),
      churn_probability: churnProbability,
      churn_confidence: confidence,
      score_breakdown: breakdown,
    });
  }

  return scores;
}
