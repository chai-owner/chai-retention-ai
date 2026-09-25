import { describe, it, expect } from "vitest";
import { assessConfidence, datedRecordCounts } from "./confidence-evidence";
import { churnConfidenceText } from "./churn-probability";

describe("evidence-weighted confidence", () => {
  it("a kind with fewer than 3 dated records doesn't count, and says why", () => {
    const a = assessConfidence(["transactions"], () => 1);
    expect(a).toEqual({ confidence: "low", dataCategories: 0, reason: "based on a single sale" });
    expect(churnConfidenceText(a.confidence, a.reason)).toBe("Low confidence — based on a single sale.");
  });
  it("counts kinds with enough evidence", () => {
    const counts: Record<string, number> = { transactions: 12, support: 4, surveys: 2 };
    const a = assessConfidence(["transactions", "support", "surveys"], (s) => counts[s]);
    expect(a.confidence).toBe("moderate");
    expect(a.reason).toBe("based on only 2 survey responses");
  });
  it("counts dated rows per source and customer", () => {
    const m = datedRecordCounts({
      customers: [{ customer_id: "A" }],
      transactions: [
        { customer_id: "A", transaction_date: "2026-01-01" },
        { customer_id: "A", transaction_date: "" },
        { customer_id: "B", transaction_date: "2026-02-01" },
      ],
    });
    expect(m.get("transactions")?.get("A")).toBe(1);
    expect(m.get("transactions")?.get("B")).toBe(1);
    expect(m.has("customers")).toBe(false);
  });
});
