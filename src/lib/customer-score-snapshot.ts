// Turns a stored `customer_scores` snapshot (written nightly by the scoring
// job) into the shapes the customer detail page renders: risk factors and
// recommended actions. This keeps the detail page consistent with the Today
// screen and the risk table, which both read the same snapshots.
//
// Client-side real-scoring.ts remains the fallback for accounts that have not
// been scored yet.
import type { Factor, Recommendation, PlannerMetric } from "@/lib/mock-data";
import { playbookFor, inferUnit } from "@/lib/metric-playbooks";
import type { ScoreBreakdownEntry } from "@/lib/customer-scoring";
import { isChurnMeta } from "@/lib/customer-scoring";

/** Metric contribution entries only — the churn meta sentinel is skipped. */
export function breakdownEntries(breakdown: unknown): ScoreBreakdownEntry[] {
  if (!Array.isArray(breakdown)) return [];
  return breakdown.filter(
    (e) => !isChurnMeta(e) && e && typeof e === "object" && "metric" in (e as object),
  ) as ScoreBreakdownEntry[];
}

const fmt = (n: number): string =>
  Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10);

function detailFor(entry: ScoreBreakdownEntry, metric?: PlannerMetric): string {
  const unit = inferUnit(entry.metric, metric?.unit);
  const value = `Currently ${fmt(entry.value)} ${unit}`.trim();
  if (entry.baseline != null && Number.isFinite(entry.baseline)) {
    return `${value} versus a baseline of ${fmt(entry.baseline)} ${unit}.`.replace(/\s+\./, ".");
  }
  return `${value} — below the healthy range for ${entry.metric}.`;
}

/**
 * Risk factors, derived from the stored breakdown. A metric drags on the score
 * when its normalised value sits below the healthy band; the factor weight is
 * that shortfall, matching the client-side scale (0–100 contribution to risk).
 */
export function factorsFromBreakdown(
  breakdown: unknown,
  metrics?: PlannerMetric[] | null,
): Factor[] {
  const byName = new Map((metrics ?? []).map((m) => [m.name, m]));
  return breakdownEntries(breakdown)
    .filter((e) => Number.isFinite(e.normalised) && e.normalised < 50)
    .map((e) => ({
      label: e.metric,
      weight: Math.max(0, Math.min(100, Math.round(100 - e.normalised))),
      detail: detailFor(e, byName.get(e.metric)),
      // Sorting key: shortfall scaled by how much the user weights the metric.
      _rank: (100 - e.normalised) * (e.weight || 1),
    }))
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 3)
    .map(({ label, weight, detail }) => ({ label, weight, detail }));
}

/** Recommended actions for the snapshot's risk factors. */
export function recommendationsFromBreakdown(
  breakdown: unknown,
  opts: {
    customerName: string;
    revenue: number;
    churnProbability: number;
    metrics?: PlannerMetric[] | null;
  },
): Recommendation[] {
  const byName = new Map((opts.metrics ?? []).map((m) => [m.name, m]));
  const values = new Map(breakdownEntries(breakdown).map((e) => [e.metric, e.value]));
  const baselines = new Map(
    breakdownEntries(breakdown).map((e) => [e.metric, e.baseline ?? null]),
  );
  return factorsFromBreakdown(breakdown, opts.metrics).map((f) => {
    const m = byName.get(f.label);
    const lowerIsBetter =
      m?.valueAt0 != null && m?.valueAt100 != null && m.valueAt0 > m.valueAt100;
    const base = playbookFor({
      metric: f.label,
      detail: f.detail,
      weight: f.weight,
      customerName: opts.customerName,
      value: values.get(f.label) ?? null,
      target: baselines.get(f.label) ?? null,
      unit: m?.unit,
      lowerIsBetter,
    });
    return {
      ...base,
      revenueSaved: Math.round(((opts.revenue * opts.churnProbability) / 100) * 0.5),
    };
  });
}

/** "today at 6:02am" / "12 Aug at 6:02am" — friendly last-scored stamp. */
export function formatScoredAt(scoredAt: string | number | Date, now = Date.now()): string {
  const d = new Date(scoredAt);
  if (Number.isNaN(d.getTime())) return "";
  const time = d
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(/\s?([AP])M/i, (_, p: string) => p.toLowerCase() + "m");
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString() === d.toDateString();
  const day = sameDay
    ? "today"
    : yesterday
      ? "yesterday"
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${day} at ${time}`;
}
