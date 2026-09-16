import { describe, it, expect } from "vitest";
import {
  breakdownEntries,
  factorsFromBreakdown,
  formatScoredAt,
  recommendationsFromBreakdown,
} from "@/lib/customer-score-snapshot";
import { CHURN_META_METRIC } from "@/lib/customer-scoring";

const breakdown = [
  { metric: "Visits per week", value: 1, normalised: 20, weight: 5, basis: "cohort", baseline: 4 },
  { metric: "Spend", value: 90, normalised: 45, weight: 1, basis: "cohort", baseline: null },
  { metric: "Tenure", value: 12, normalised: 80, weight: 3, basis: "cohort", baseline: null },
  {
    metric: CHURN_META_METRIC,
    churn_probability: 72,
    churn_horizon_days: 90,
    confidence: "medium",
    data_categories: 3,
  },
];

describe("customer score snapshot", () => {
  it("skips the churn meta sentinel", () => {
    expect(breakdownEntries(breakdown).map((e) => e.metric)).toEqual([
      "Visits per week",
      "Spend",
      "Tenure",
    ]);
    expect(breakdownEntries(null)).toEqual([]);
  });

  it("surfaces only under-performing metrics, worst first", () => {
    const factors = factorsFromBreakdown(breakdown);
    expect(factors.map((f) => f.label)).toEqual(["Visits per week", "Spend"]);
    expect(factors[0]!.weight).toBe(80);
    expect(factors[0]!.detail).toContain("4");
  });

  it("builds actionable recommendations from the breakdown", () => {
    const recs = recommendationsFromBreakdown(breakdown, {
      customerName: "Acme",
      revenue: 1000,
      churnProbability: 72,
    });
    expect(recs).toHaveLength(2);
    expect(recs[0]!.steps?.length).toBeGreaterThan(0);
    expect(recs[0]!.revenueSaved).toBe(360);
  });

  it("formats the scored-at stamp relative to today", () => {
    const now = new Date("2026-09-03T12:00:00Z").getTime();
    expect(formatScoredAt(new Date(now), now)).toMatch(/^today at /);
    expect(formatScoredAt(new Date(now - 86_400_000), now)).toMatch(/^yesterday at /);
    expect(formatScoredAt("not-a-date", now)).toBe("");
  });
});
