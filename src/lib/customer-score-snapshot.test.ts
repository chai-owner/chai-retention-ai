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

  it("widens the band for at-risk and critical health scores", () => {
    const mild = [
      { metric: "Visits per week", value: 3, normalised: 60, weight: 5, basis: "cohort", baseline: 4 },
    ];
    expect(factorsFromBreakdown(mild, null, 85)).toEqual([]);
    expect(factorsFromBreakdown(mild, null, 65)).toHaveLength(1);
    expect(factorsFromBreakdown(mild, null, 30)).toHaveLength(1);
  });

  it("falls back to the worst metrics for a critical customer with no clear factors", () => {
    const mild = [
      { metric: "Visits per week", value: 3, normalised: 72, weight: 5, basis: "cohort", baseline: 4 },
      { metric: "Spend", value: 90, normalised: 81, weight: 1, basis: "cohort", baseline: null },
      { metric: "Tenure", value: 12, normalised: 90, weight: 3, basis: "cohort", baseline: null },
      { metric: "Logins", value: 5, normalised: 95, weight: 2, basis: "cohort", baseline: null },
    ];
    const factors = factorsFromBreakdown(mild, null, 25);
    expect(factors.map((f) => f.label)).toEqual(["Visits per week", "Spend", "Tenure"]);
    // Not critical → no fallback.
    expect(factorsFromBreakdown(mild, null, 55)).toEqual([]);
  });

  it("adds a generic urgent recommendation for critical customers without factors", () => {
    const healthyBreakdown: unknown[] = [];
    const recs = recommendationsFromBreakdown(healthyBreakdown, {
      customerName: "Acme",
      revenue: 1000,
      churnProbability: 80,
      healthScore: 20,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]!.title).toBe("Contact this customer urgently");
    expect(recs[0]!.priority).toBe("High");
    expect(recs[0]!.reasoning).toContain("high risk of churning");
    // Non-critical customers keep the empty list.
    expect(
      recommendationsFromBreakdown(healthyBreakdown, {
        customerName: "Acme",
        revenue: 1000,
        churnProbability: 20,
        healthScore: 75,
      }),
    ).toEqual([]);
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
