// Pure "daily brief" builder shared by the Today screen and the Monday email
// digest. It reads ONLY the stored scoring snapshots in `customer_scores`
// (produced by the daily scoring job) — the client-side scoring path is
// untouched and is not involved here.
import {
  churnMetaOf,
  type ChurnMetaEntry,
  type RiskLevel,
  type ScoreBreakdownEntry,
} from "@/lib/customer-scoring";
import { churnConfidenceFor, churnProbabilityFromHealth, type ChurnConfidence } from "@/lib/churn-probability";
import { playbookFor } from "@/lib/metric-playbooks";

/** A row as stored in `customer_scores`. */
export interface SnapshotRow {
  customer_id: string;
  score: number;
  risk_level: RiskLevel;
  score_breakdown?: Array<ScoreBreakdownEntry | ChurnMetaEntry> | null;
  scored_at?: string | null;
}

export interface BriefAction {
  customerId: string;
  name: string;
  score: number;
  riskLevel: RiskLevel;
  /** Change vs the previous snapshot, null when there is no history yet. */
  delta: number | null;
  /** The metric dragging their score down the most. */
  topMetric: string | null;
  topMetricValue: number | null;
  /** Plain-English next step. */
  action: string;
  actionTitle: string;
  /** Probability of churning within the next 90 days, derived from the score. */
  churnProbability: number;
  churnConfidence: ChurnConfidence;
}

export interface DailyBrief {
  atRiskCount: number;
  criticalCount: number;
  needsAttention: number;
  movedCount: number;
  improvedCount: number;
  declinedCount: number;
  droppedIntoCritical: number;
  totalScored: number;
  headline: string;
  actions: BriefAction[];
}

export interface BriefInput {
  latest: SnapshotRow[];
  /** The comparison snapshot (typically yesterday's rows). */
  previous?: SnapshotRow[];
  /** customer_id -> display name. */
  names?: Record<string, string>;
  /** Points of movement that counts as "significant". */
  significantDelta?: number;
  /** How many customers the action list may contain. */
  limit?: number;
}

export const SIGNIFICANT_DELTA = 5;
const HEALTHY_SCORE = 70;

function displayName(id: string, names?: Record<string, string>): string {
  const name = names?.[id]?.trim();
  return name && name.length > 0 ? name : id;
}

/** The breakdown entry hurting a customer's score the most (lowest weighted contribution). */
export function topDragEntry(row: SnapshotRow): ScoreBreakdownEntry | null {
  const entries = ((row.score_breakdown ?? []) as ScoreBreakdownEntry[]).filter(
    (e) => e && typeof e.metric === "string" && Number.isFinite(e.normalised),
  );
  if (entries.length === 0) return null;
  let worst = entries[0]!;
  let worstCost = (100 - worst.normalised) * (worst.weight || 1);
  for (const entry of entries.slice(1)) {
    const cost = (100 - entry.normalised) * (entry.weight || 1);
    if (cost > worstCost) {
      worst = entry;
      worstCost = cost;
    }
  }
  return worst;
}

/** Median value for a metric across customers who are currently healthy. */
function peerTarget(rows: SnapshotRow[], metric: string): number | null {
  const values = rows
    .filter((r) => r.score >= HEALTHY_SCORE)
    .map((r) => ((r.score_breakdown ?? []) as ScoreBreakdownEntry[]).find((e) => e.metric === metric)?.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  return values[Math.floor(values.length / 2)] ?? null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildHeadline(brief: Omit<DailyBrief, "headline" | "actions">): string {
  if (brief.totalScored === 0) {
    return "No scored customers yet — add or connect data and ChAi will start your daily brief.";
  }
  if (brief.droppedIntoCritical > 0) {
    return `${plural(brief.droppedIntoCritical, "customer")} dropped into critical since your last brief.`;
  }
  if (brief.declinedCount > 0) {
    return `${plural(brief.declinedCount, "customer")} slipped noticeably — worth a call today.`;
  }
  if (brief.needsAttention > 0) {
    return `${plural(brief.needsAttention, "customer needs", "customers need")} attention, and nothing got worse overnight.`;
  }
  if (brief.improvedCount > 0) {
    return `Everyone is healthy and ${plural(brief.improvedCount, "customer")} improved since yesterday.`;
  }
  return "All quiet — every scored customer is in healthy territory today.";
}

export function buildDailyBrief(input: BriefInput): DailyBrief {
  const latest = input.latest ?? [];
  const threshold = input.significantDelta ?? SIGNIFICANT_DELTA;
  const limit = input.limit ?? 5;

  const previousById = new Map<string, SnapshotRow>();
  for (const row of input.previous ?? []) previousById.set(row.customer_id, row);

  let improvedCount = 0;
  let declinedCount = 0;
  let droppedIntoCritical = 0;
  const deltaById = new Map<string, number | null>();

  for (const row of latest) {
    const before = previousById.get(row.customer_id);
    if (!before) {
      deltaById.set(row.customer_id, null);
      continue;
    }
    const delta = Math.round((row.score - before.score) * 10) / 10;
    deltaById.set(row.customer_id, delta);
    if (delta >= threshold) improvedCount++;
    else if (delta <= -threshold) declinedCount++;
    if (row.risk_level === "critical" && before.risk_level !== "critical") droppedIntoCritical++;
  }

  const criticalCount = latest.filter((r) => r.risk_level === "critical").length;
  const atRiskCount = latest.filter((r) => r.risk_level === "at-risk").length;

  const ranked = [...latest]
    .filter((r) => r.risk_level !== "healthy")
    .sort((a, b) => {
      const da = deltaById.get(a.customer_id) ?? 0;
      const db = deltaById.get(b.customer_id) ?? 0;
      // Worst score first; a bigger drop breaks ties.
      if (a.score !== b.score) return a.score - b.score;
      return da - db;
    })
    .slice(0, limit);

  const actions: BriefAction[] = ranked.map((row) => {
    const drag = topDragEntry(row);
    const meta = churnMetaOf(row.score_breakdown);
    const name = displayName(row.customer_id, input.names);
    const metric = drag?.metric ?? null;
    const play = playbookFor({
      metric: metric ?? "customer health",
      detail:
        metric != null
          ? `${metric} is the biggest drag on their health score right now.`
          : "Their overall health score is below where it should be.",
      weight: Math.round(100 - row.score),
      customerName: name,
      value: drag?.value ?? null,
      target: metric ? peerTarget(latest, metric) : null,
    });
    return {
      customerId: row.customer_id,
      name,
      score: Math.round(row.score),
      riskLevel: row.risk_level,
      delta: deltaById.get(row.customer_id) ?? null,
      topMetric: metric,
      topMetricValue: drag?.value ?? null,
      action: play.steps[0] ?? play.title,
      actionTitle: play.title,
      churnProbability: meta?.churn_probability ?? churnProbabilityFromHealth(row.score),
      churnConfidence: meta?.confidence ?? churnConfidenceFor(new Set((row.score_breakdown ?? []).map((e) => (e as ScoreBreakdownEntry).metric)).size),
    };
  });

  const core = {
    atRiskCount,
    criticalCount,
    needsAttention: atRiskCount + criticalCount,
    movedCount: improvedCount + declinedCount,
    improvedCount,
    declinedCount,
    droppedIntoCritical,
    totalScored: latest.length,
  };

  return { ...core, headline: buildHeadline(core), actions };
}
