// Pure server-side scoring maths for the daily customer scoring job.
// Deliberately independent of the client-side scoring path (real-scoring.ts):
// this produces the stored `customer_scores` snapshot and changes nothing the
// app already computes in the browser.
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { resolveMetric } from "@/lib/metric-resolution";

export type RiskLevel = "healthy" | "at-risk" | "critical";

export interface ScoreBreakdownEntry {
  metric: string;
  value: number;
  normalised: number;
  weight: number;
}

export interface CustomerScore {
  customer_id: string;
  score: number;
  risk_level: RiskLevel;
  score_breakdown: ScoreBreakdownEntry[];
}

export function riskLevelFor(score: number): RiskLevel {
  if (score >= 70) return "healthy";
  if (score >= 40) return "at-risk";
  return "critical";
}

// A metric is "lower is better" when its display anchors are inverted
// (valueAt0 > valueAt100), e.g. "days since last payment".
function lowerIsBetter(metric: PlannerMetric): boolean {
  return metric.valueAt0 != null && metric.valueAt100 != null && metric.valueAt0 > metric.valueAt100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Scores every customer in `data.customers` against `metrics`.
 * Each metric value is min-max normalised across the customer base, weighted by
 * the metric's `weight` (default 1), and averaged into a 0–100 health score.
 */
export function scoreCustomers(
  metrics: PlannerMetric[],
  data: IngestedData,
  now = Date.now(),
): CustomerScore[] {
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
      invert: lowerIsBetter(metric),
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
      // A flat distribution carries no signal — treat everyone as mid-range.
      const spread = entry.max - entry.min;
      let normalised = spread === 0 ? 50 : ((value - entry.min) / spread) * 100;
      if (entry.invert) normalised = 100 - normalised;
      normalised = clamp(Math.round(normalised * 100) / 100);
      breakdown.push({
        metric: entry.metric.name,
        value: Math.round(value * 100) / 100,
        normalised,
        weight,
      });
      weighted += normalised * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) / 100 : 0;
    return {
      customer_id: customerId,
      score,
      risk_level: riskLevelFor(score),
      score_breakdown: breakdown,
    };
  });
}
