// Data coverage & freshness. Tells the user how much of the intelligence they
// are seeing is actually backed by recent data — and what is missing or stale.
import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { metricDatasetDependencies, resolveMetric } from "@/lib/metric-resolution";

export const STALE_DAYS = 30;
const DAY = 86400000;

export type CoverageStatus = "missing" | "stale" | "ok";

export interface DatasetCoverage {
  key: string;
  label: string;
  rows: number;
  lastDate: number | null;
  daysSince: number | null;
  status: CoverageStatus;
}

export interface DataCoverage {
  datasets: DatasetCoverage[];
  missing: DatasetCoverage[];
  stale: DatasetCoverage[];
  customerCount: number;
  confidence: "low" | "partial" | "good";
  notes: string[];
  headline: string;
  /** True when there is something worth warning the user about. */
  flagged: boolean;
}

const DATE_FIELDS = [
  "transaction_date",
  "survey_date",
  "created_date",
  "occurred_at",
  "submitted_at",
  "created_at",
  "date",
  "last_activity",
  "signup_date",
];

function parseDate(v?: string): number | null {
  if (!v) return null;
  const t = Date.parse(v.trim());
  return Number.isNaN(t) ? null : t;
}

function latestDate(rows: IngestRow[]): number | null {
  let best: number | null = null;
  for (const r of rows) {
    for (const f of DATE_FIELDS) {
      const d = parseDate(r[f]);
      if (d != null && (best == null || d > best)) best = d;
    }
  }
  return best;
}

const BASE_SIGNALS: { key: string; label: string }[] = [
  { key: "transactions", label: "Transactions" },
  { key: "usage", label: "Usage / activity" },
  { key: "surveys", label: "Surveys (CSAT / NPS)" },
];

function describe(d: DatasetCoverage): string {
  if (d.status === "missing") return `No ${d.label.toLowerCase()} data has been added.`;
  return `${d.label} data is ${d.daysSince} days old.`;
}

export function assessCoverage(
  data: IngestedData,
  metrics?: PlannerMetric[] | null,
  now: number = Date.now(),
): DataCoverage {
  const activeMetrics = metrics ?? [];
  const requiredDatasets = new Set(activeMetrics.flatMap((metric) => metricDatasetDependencies(metric, data)));
  const baseSignals = activeMetrics.length === 0
    ? [...BASE_SIGNALS]
    : BASE_SIGNALS.filter(({ key }) => (data[key] ?? []).length > 0 || requiredDatasets.has(key));
  if ((data.support ?? []).length > 0 || requiredDatasets.has("support")) {
    baseSignals.push({ key: "support", label: "Support tickets" });
  }
  const metricSignals = activeMetrics.map((metric) => {
    const resolved = resolveMetric(metric, data, now);
    return {
      key: `metric:${metric.name}`,
      label: metric.name,
      rows: resolved.rowCount,
      lastDate: resolved.latestDate,
    };
  });

  const datasets: DatasetCoverage[] = [
    ...baseSignals.map(({ key, label }) => ({ key, label, rows: (data[key] ?? []).length, lastDate: latestDate(data[key] ?? []) })),
    ...metricSignals,
  ].map(({ key, label, rows, lastDate }) => {
    const daysSince = lastDate == null ? null : Math.max(0, Math.round((now - lastDate) / DAY));
    let status: CoverageStatus = "ok";
    if (rows === 0) status = "missing";
    else if (daysSince != null && daysSince > STALE_DAYS) status = "stale";
    return { key, label, rows, lastDate, daysSince, status };
  });

  const missing = datasets.filter((d) => d.status === "missing");
  const stale = datasets.filter((d) => d.status === "stale");
  const customerCount = (data.customers ?? []).length;
  const present = datasets.length - missing.length;

  let confidence: DataCoverage["confidence"] = "good";
  if (customerCount === 0 || present === 0 || missing.length > datasets.length / 2) {
    confidence = "low";
  } else if (missing.length > 0 || stale.length > 0) {
    confidence = "partial";
  }

  const notes: string[] = [];
  if (customerCount === 0) notes.push("No customer records have been added yet.");
  for (const d of missing) notes.push(describe(d));
  for (const d of stale) notes.push(describe(d));

  const headline =
    confidence === "low"
      ? "Limited data — this assessment is incomplete"
      : stale.length > 0 && missing.length === 0
        ? "Some of your data may be out of date"
        : "Parts of your data are missing or out of date";

  return {
    datasets,
    missing,
    stale,
    customerCount,
    confidence,
    notes,
    headline,
    flagged: confidence !== "good",
  };
}

/** One-sentence summary of what the assessment is based on. */
export function coverageBasis(c: DataCoverage): string {
  const present = c.datasets.filter((d) => d.status !== "missing");
  const list = present.map((d) => d.label.toLowerCase());
  const parts = [`${c.customerCount} customer${c.customerCount === 1 ? "" : "s"}`];
  if (list.length) parts.push(list.join(", "));
  return `Based on the data available today: ${parts.join(" and ")}.`;
}
