import { describe, expect, it } from "vitest";
import {
  factorsFromBreakdown,
  recommendationsFromBreakdown,
  snapshotHasEvidence,
  splitSnapshotRows,
} from "@/lib/customer-score-snapshot";
import { analyzedCopyFor } from "@/components/customer/risk-panels";

const churnOnly = [{ metric: "__churn__", confidence: "low", data_categories: 0, churn_probability: 85, churn_horizon_days: 90 }];
const withMeasure = [
  ...churnOnly,
  { metric: "Days since last purchase", value: 200, normalised: 10, weight: 1, basis: "cohort" },
];

describe("saved scores with nothing behind them", () => {
  it("a saved score with no measures is ignored", () => {
    expect(snapshotHasEvidence(churnOnly)).toBe(false);
    expect(snapshotHasEvidence([])).toBe(false);
    expect(snapshotHasEvidence(withMeasure)).toBe(true);
    const { scored, unscored } = splitSnapshotRows([
      { customer_id: "a", score_breakdown: churnOnly },
      { customer_id: "b", score_breakdown: withMeasure },
    ]);
    expect(scored.map((r) => r.customer_id)).toEqual(["b"]);
    expect(unscored.map((r) => r.customer_id)).toEqual(["a"]);
  });

  it("no urgent action for a 0 score with no measures", () => {
    const recs = recommendationsFromBreakdown(churnOnly, { customerName: "X", revenue: 0, churnProbability: 85, healthScore: 0 });
    expect(recs).toEqual([]);
    expect(recs.some((r) => /urgently/i.test(r.title))).toBe(false);
  });

  it("'Why at risk' only names measures the customer has data for", () => {
    const factors = factorsFromBreakdown(withMeasure, [], 10);
    const copy = analyzedCopyFor(factors.map((f) => f.label));
    expect(copy).toContain("Days since last purchase");
    expect(copy).not.toContain("Admin Portal Login Cadence");
    expect(analyzedCopyFor([])).not.toMatch(/ChAi analyzed/);
  });
});
