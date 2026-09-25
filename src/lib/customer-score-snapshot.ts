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
import { contentEntryOf, isContentEntry } from "@/lib/content-signals/scoring";
import { signalLabel, sourceLabelFor } from "@/lib/content-signals/labels";

/**
 * Hard-metric contribution entries only — the churn meta sentinel and the
 * AI-detected content entry are skipped (see `contentFactorFromBreakdown`).
 */
export function breakdownEntries(breakdown: unknown): ScoreBreakdownEntry[] {
  if (!Array.isArray(breakdown)) return [];
  return breakdown.filter(
    (e) =>
      !isChurnMeta(e) &&
      !isContentEntry(e) &&
      e &&
      typeof e === "object" &&
      "metric" in (e as object),
  ) as ScoreBreakdownEntry[];
}

/** Distinct "Competitor mentioned · HubSpot" style labels for AI-detected signals. */
export function contentSignalLabels(breakdown: unknown): Array<{ label: string; source: string }> {
  const entry = contentEntryOf(breakdown);
  if (!entry) return [];
  const seen = new Set<string>();
  const out: Array<{ label: string; source: string }> = [];
  for (const s of entry.signals) {
    const label = signalLabel(s.signal);
    const source = sourceLabelFor(s.source);
    const k = `${label}\u0000${source}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, source });
  }
  return out;
}

/** One AI-detected factor summarising the content entry, or null. */
export function contentFactorFromBreakdown(breakdown: unknown): Factor | null {
  const entry = contentEntryOf(breakdown);
  if (!entry) return null;
  const labels = contentSignalLabels(breakdown);
  const types = [...new Set(labels.map((l) => l.label))];
  const sources = [...new Set(labels.map((l) => l.source))];
  return {
    label: types.join(", "),
    weight: Math.max(0, Math.min(100, Math.round(entry.strength ?? 100 - entry.normalised))),
    detail: `Picked up by AI from ${sources.join(" and ")} conversations. Weighted modestly and fades as it gets older — see the quotes below.`,
    aiDetected: true,
  };
}

const fmt = (n: number): string =>
  Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10);

function detailFor(entry: ScoreBreakdownEntry, metric?: PlannerMetric): string {
  const unit = inferUnit(entry.metric, metric?.unit);
  if (entry.comparison) return entry.comparison;
  const value = `Currently ${fmt(entry.value)} ${unit}`.trim();
  if ((entry.basis === "baseline-30d" || entry.basis === "baseline-90d") && entry.baseline != null && Number.isFinite(entry.baseline)) {
    return `${value} versus a baseline of ${fmt(entry.baseline)} ${unit}.`.replace(/\s+\./, ".");
  }
  return `${value} — below the healthy range for ${entry.metric}.`;
}

/**
 * Risk factors, derived from the stored breakdown. A metric drags on the score
 * when its normalised value sits below the healthy band; the factor weight is
 * that shortfall, matching the client-side scale (0–100 contribution to risk).
 *
 * The band widens with the customer's overall health: at-risk (<70) and
 * critical (<40) customers capture factors up to normalised 70, and a critical
 * customer always shows the worst three entries even if none cross the band —
 * a critical account must never render as "healthy".
 *
 * An AI-detected content factor, when present, is appended after the metric
 * factors and flagged `aiDetected` so it never looks like a hard metric.
 */
export function factorsFromBreakdown(
  breakdown: unknown,
  metrics?: PlannerMetric[] | null,
  healthScore?: number | null,
): Factor[] {
  const content = contentFactorFromBreakdown(breakdown);
  const withContent = (list: Factor[]) => (content ? [...list, content] : list);
  const byName = new Map((metrics ?? []).map((m) => [m.name, m]));
  const threshold = healthScore != null && healthScore < 70 ? 70 : 50;
  const toFactor = (e: ScoreBreakdownEntry) => ({
    label: e.metric,
    weight: Math.max(0, Math.min(100, Math.round(100 - e.normalised))),
    detail: detailFor(e, byName.get(e.metric)),
    // Sorting key: shortfall scaled by how much the user weights the metric.
    _rank: (100 - e.normalised) * (e.weight || 1),
  });
  const ranked = breakdownEntries(breakdown)
    .filter((e) => Number.isFinite(e.normalised) && e.normalised < threshold)
    .map(toFactor)
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 3)
    .map(({ label, weight, detail }) => ({ label, weight, detail }));
  if (ranked.length > 0 || healthScore == null || healthScore >= 40) return withContent(ranked);
  // Critical customer with no entries under the band: show the worst metrics.
  return withContent(
    breakdownEntries(breakdown)
      .filter((e) => Number.isFinite(e.normalised))
      .map(toFactor)
      .sort((a, b) => (a.weight === b.weight ? 0 : b.weight - a.weight))
      .slice(0, 3)
      .map(({ label, weight, detail }) => ({ label, weight, detail })),
  );
}

/** Recommended actions for the snapshot's risk factors. */
export function recommendationsFromBreakdown(
  breakdown: unknown,
  opts: {
    customerName: string;
    revenue: number;
    churnProbability: number;
    metrics?: PlannerMetric[] | null;
    healthScore?: number | null;
  },
): Recommendation[] {
  const byName = new Map((opts.metrics ?? []).map((m) => [m.name, m]));
  const values = new Map(breakdownEntries(breakdown).map((e) => [e.metric, e.value]));
  const baselines = new Map(
    breakdownEntries(breakdown).map((e) => [e.metric, e.baseline ?? null]),
  );
  const factors = factorsFromBreakdown(breakdown, opts.metrics, opts.healthScore);
  if (factors.length === 0 && opts.healthScore != null && opts.healthScore < 40) {
    // Critical account with no identifiable factors still needs an action.
    return [
      {
        title: "Contact this customer urgently",
        reasoning:
          "Their health score indicates a high risk of churning. Review their recent activity and reach out this week.",
        priority: "High",
        difficulty: "Easy",
        impact: "High",
        revenueSaved: Math.round(((opts.revenue * opts.churnProbability) / 100) * 0.5),
        steps: [
          "Review this customer's recent activity and support history.",
          "Reach out personally this week — call or email their main contact.",
          "Offer help with any outstanding issues and confirm next steps.",
        ],
      },
    ];
  }
  return factors.map((f) => {
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
