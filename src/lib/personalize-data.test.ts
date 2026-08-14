// Tier 1 — upload schemas generated for AI-selected metrics.
import { describe, it, expect } from "vitest";
import {
  metricColumnName,
  customMetricKeys,
  buildCustomMetricDatasets,
  personalizeDatasets,
} from "@/lib/personalize-data";
import { datasetSchemas } from "@/lib/data-schemas";
import type { PlannerMetric } from "@/lib/mock-data";
import { makeProfile } from "@/test/fixtures";

const metric = (name: string, extra: Partial<PlannerMetric> = {}): PlannerMetric =>
  ({
    name,
    why: "why",
    churn: "churn",
    cadence: "Weekly",
    benchmark: "b",
    benchmarkScore: 60,
    category: "Engagement",
    ...extra,
  }) as PlannerMetric;

describe("metricColumnName", () => {
  it("snake-cases and strips punctuation", () => {
    expect(metricColumnName("CSAT / NPS")).toBe("csat_nps");
    expect(metricColumnName("  Class Attendance Rate! ")).toBe("class_attendance_rate");
  });
  it("falls back to 'metric' for unusable names", () => {
    expect(metricColumnName("!!!")).toBe("metric");
  });
});

describe("customMetricKeys", () => {
  it("returns one key/column per metric", () => {
    const keys = customMetricKeys([metric("Visits per week"), metric("Refill rate")]);
    expect(keys.map((k) => k.key)).toEqual(["metric_visits_per_week", "metric_refill_rate"]);
    expect(keys.map((k) => k.column)).toEqual(["visits_per_week", "refill_rate"]);
  });

  it("de-duplicates metrics that collapse to the same column name", () => {
    const keys = customMetricKeys([metric("Visit rate"), metric("Visit / rate")]);
    expect(new Set(keys.map((k) => k.key)).size).toBe(2);
    expect(new Set(keys.map((k) => k.column)).size).toBe(2);
  });

  it("returns an empty list when there are no metrics", () => {
    expect(customMetricKeys(undefined)).toEqual([]);
    expect(customMetricKeys([])).toEqual([]);
  });
});

describe("buildCustomMetricDatasets", () => {
  const metrics = [
    metric("Class attendance rate", { unit: "%", decimals: 0, valueAt0: 0, valueAt100: 100 }),
    metric("Refill spend", { prefix: "$", decimals: 0, valueAt0: 0, valueAt100: 500 }),
  ];

  it("creates one upload schema per AI-selected metric", () => {
    const out = buildCustomMetricDatasets(metrics);
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.key)).toEqual(["metric_class_attendance_rate", "metric_refill_spend"]);
  });

  it("takes any customer identifier plus date and the metric value column", () => {
    const [ds] = buildCustomMetricDatasets(metrics);
    expect(ds.fields.map((f) => f.name)).toEqual([
      "customer_id",
      "email",
      "customer_name",
      "date",
      "class_attendance_rate",
    ]);
    // Identifier columns are optional individually — at least one is needed.
    expect(ds.fields.filter((f) => f.identifier).map((f) => f.mandatory)).toEqual([
      false,
      false,
      false,
    ]);
    expect(ds.fields.filter((f) => !f.identifier).every((f) => f.mandatory)).toBe(true);
  });


  it("labels the dataset with the metric name and unit and ships sample rows", () => {
    const [ds] = buildCustomMetricDatasets(metrics);
    expect(ds.label).toBe("Class attendance rate (%)");
    expect(ds.sampleRows).toHaveLength(2);
    expect(ds.sampleRows[0]).toHaveLength(ds.fields.length);
  });

  it("keys match what the scorer looks up via customMetricKeys", () => {
    const schemaKeys = buildCustomMetricDatasets(metrics).map((d) => d.key);
    const scorerKeys = customMetricKeys(metrics).map((k) => k.key);
    expect(schemaKeys).toEqual(scorerKeys);
  });

  it("returns nothing when the profile has no AI metrics", () => {
    expect(buildCustomMetricDatasets([])).toEqual([]);
  });
});

describe("personalizeDatasets", () => {
  it("always requires the customer list", () => {
    const out = personalizeDatasets(null, datasetSchemas);
    expect(out.find((d) => d.key === "customers")!.required).toBe(true);
  });

  it("requires usage data for a SaaS business model", () => {
    const out = personalizeDatasets(makeProfile({ model: "SaaS" }), datasetSchemas);
    const usage = out.find((d) => d.key === "usage")!;
    expect(usage.required).toBe(true);
    expect(usage.reasons.join(" ")).toMatch(/usage data is essential/i);
  });

  it("requires transactions for an ecommerce business model", () => {
    const out = personalizeDatasets(
      makeProfile({ model: "Ecommerce", successActions: "", disengagement: "" }),
      datasetSchemas,
    );
    expect(out.find((d) => d.key === "transactions")!.required).toBe(true);
  });

  it("promotes model-critical optional fields to mandatory", () => {
    const out = personalizeDatasets(makeProfile({ model: "SaaS" }), datasetSchemas);
    const logins = out.find((d) => d.key === "usage")!.fields.find((f) => f.name === "logins")!;
    expect(logins.mandatory).toBe(true);
    expect(logins.promoted).toBe(true);
  });

  it("derives requirements from the free-text success answers", () => {
    const out = personalizeDatasets(
      makeProfile({ model: "Other", successActions: "They stay satisfied and NPS stays high", disengagement: "" }),
      datasetSchemas,
    );
    expect(out.find((d) => d.key === "surveys")!.required).toBe(true);
  });
});
