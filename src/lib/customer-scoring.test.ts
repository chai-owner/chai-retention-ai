import { describe, it, expect } from "vitest";
import { scoreCustomers, riskLevelFor } from "@/lib/customer-scoring";
import type { PlannerMetric } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";

const metric: PlannerMetric = {
  name: "Average Workout Duration",
  why: "Average duration of each workout session in minutes.",
  churn: "Shorter sessions signal disengagement.",
  category: "Usage",
  weight: 2,
};

const data: IngestedData = {
  customers: [{ customer_id: "a" }, { customer_id: "b" }, { customer_id: "c" }],
  usage: [
    { customer_id: "a", workout_duration_minutes: "10", occurred_at: "2026-01-01" },
    { customer_id: "b", workout_duration_minutes: "50", occurred_at: "2026-01-01" },
    { customer_id: "c", workout_duration_minutes: "90", occurred_at: "2026-01-01" },
  ],
};

describe("riskLevelFor", () => {
  it("bands scores", () => {
    expect(riskLevelFor(70)).toBe("healthy");
    expect(riskLevelFor(40)).toBe("at-risk");
    expect(riskLevelFor(39.9)).toBe("critical");
  });
});

describe("scoreCustomers", () => {
  it("min-max normalises across the customer base", () => {
    const scores = scoreCustomers([metric], data);
    const byId = Object.fromEntries(scores.map((s) => [s.customer_id, s]));
    expect(byId.a!.score).toBe(0);
    expect(byId.c!.score).toBe(100);
    expect(byId.b!.score).toBeGreaterThan(0);
    expect(byId.c!.risk_level).toBe("healthy");
    expect(byId.a!.risk_level).toBe("critical");
  });

  it("records a breakdown entry per resolved metric", () => {
    const [first] = scoreCustomers([metric], data);
    expect(first!.score_breakdown).toHaveLength(1);
    expect(first!.score_breakdown[0]).toMatchObject({ metric: metric.name, weight: 2 });
  });

  it("inverts metrics where lower is better", () => {
    const inverted: PlannerMetric = { ...metric, valueAt0: 90, valueAt100: 10 };
    const scores = scoreCustomers([inverted], data);
    const byId = Object.fromEntries(scores.map((s) => [s.customer_id, s]));
    expect(byId.a!.score).toBe(100);
    expect(byId.c!.score).toBe(0);
  });

  it("returns nothing without customers or metrics", () => {
    expect(scoreCustomers([], data)).toEqual([]);
    expect(scoreCustomers([metric], { customers: [] })).toEqual([]);
  });

  it("scores 0 when no metric resolves for a customer", () => {
    const scores = scoreCustomers([metric], { customers: [{ customer_id: "z" }] });
    expect(scores[0]).toMatchObject({ customer_id: "z", score: 0, risk_level: "critical" });
  });
});
