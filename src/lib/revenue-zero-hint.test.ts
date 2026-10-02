import { describe, expect, it } from "vitest";
import { revenueZeroHint } from "@/lib/revenue-zero-hint";
import { buildRealDataset } from "@/lib/real-scoring";
import { DEFAULT_METRIC_WEIGHTS } from "@/lib/mock-data";
import { makeProfile } from "@/test/fixtures";

const riskHint = "Across at-risk & critical accounts";
const opportunityHint = "Recoverable with action";

describe("dashboard revenue zero hints", () => {
  it("marks zero estimates inconclusive when any customer is not scoreable", () => {
    const customers = [{ revenue: 1200, hasUsableRevenue: true }, { revenue: 0, notEnoughData: true }];
    expect(revenueZeroHint(0, customers as never, 1, riskHint)).toBe("Not enough data yet to estimate");
    expect(revenueZeroHint(0, customers as never, 1, opportunityHint)).toBe("Not enough data yet to estimate");
  });

  it("marks zero estimates inconclusive if foreign currency leaves no usable revenue", () => {
    const ds = buildRealDataset(
      {
        customers: [{ customer_id: "A", name: "A" }],
        transactions: [{ customer_id: "A", amount: "200", currency: "ZAR" }],
        surveys: ["1", "2", "3"].map((id) => ({ customer_id: "A", score: "5", survey_id: id })),
      },
      DEFAULT_METRIC_WEIGHTS,
      { ...makeProfile(), dataCurrency: "USD" },
    );
    expect(ds.customers[0].hasUsableRevenue).toBe(false);
    expect(revenueZeroHint(0, ds.customers, 0, riskHint)).toBe("Not enough data yet to estimate");
    expect(revenueZeroHint(0, ds.customers, 0, opportunityHint)).toBe("Not enough data yet to estimate");
  });

  it("keeps the original captions for a trustworthy zero", () => {
    const customers = [{ revenue: 1200, hasUsableRevenue: true }];
    expect(revenueZeroHint(0, customers as never, 0, riskHint)).toBe(riskHint);
    expect(revenueZeroHint(0, customers as never, 0, opportunityHint)).toBe(opportunityHint);
  });

  it("keeps the original captions for positive amounts even with incomplete data", () => {
    expect(revenueZeroHint(100, [], 3, riskHint)).toBe(riskHint);
    expect(revenueZeroHint(50, [], 3, opportunityHint)).toBe(opportunityHint);
  });
});