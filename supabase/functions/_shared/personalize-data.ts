// Trimmed port of src/lib/personalize-data.ts: only metricColumnName and
// customMetricKeys, which is all metric-resolution.ts needs. The dataset
// personalization logic (onboarding UI helper) was not ported.
import type { PlannerMetric } from "./types.ts";

export function metricColumnName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "metric"
  );
}

export interface CustomMetricKey {
  metric: PlannerMetric;
  key: string;
  column: string;
}

export function customMetricKeys(metrics: PlannerMetric[] | undefined): CustomMetricKey[] {
  if (!metrics || metrics.length === 0) return [];
  const usedKeys = new Set<string>();
  const usedCols = new Set<string>();
  const out: CustomMetricKey[] = [];
  for (const m of metrics) {
    const base = metricColumnName(m.name);
    let col = base;
    let i = 2;
    while (usedCols.has(col)) col = `${base}_${i++}`;
    usedCols.add(col);
    let key = `metric_${col}`;
    let j = 2;
    while (usedKeys.has(key)) key = `metric_${col}_${j++}`;
    usedKeys.add(key);
    out.push({ metric: m, key, column: col });
  }
  return out;
}
