import { describe, expect, it } from "vitest";
import { resolveMetric } from "@/lib/metric-resolution";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";

const metric = (name: string, why: string, category = "Engagement"): PlannerMetric => ({
  name,
  why,
  churn: "A change can signal churn.",
  category,
});

describe("resolveMetric", () => {
  it("finds and averages a value nested in a standard usage payload", () => {
    const data = {
      usage: [
        { customer_id: "A", date: "2026-08-10", data: '{"workout":{"workout_duration_minutes":20}}' },
        { customer_id: "A", date: "2026-08-11", data: '{"workout":{"workout_duration_minutes":40}}' },
      ],
    } as IngestedData;
    const resolved = resolveMetric(metric("Average Workout Duration", "Average workout duration in minutes"), data);
    expect(resolved.dataset).toBe("usage");
    expect(resolved.field).toContain("workout_duration_minutes");
    expect(resolved.values.get("A")).toBe(30);
  });

  it("uses a dedicated metric dataset when it has values", () => {
    const data: IngestedData = {
      metric_custom_score: [{ customer_id: "A", date: "2026-08-10", custom_score: "72" }],
      usage: [{ customer_id: "A", date: "2026-08-10", score: "10" }],
    };
    const resolved = resolveMetric(metric("Custom Score", "A custom score"), data);
    expect(resolved.dataset).toBe("metric_custom_score");
    expect(resolved.values.get("A")).toBe(72);
  });
});