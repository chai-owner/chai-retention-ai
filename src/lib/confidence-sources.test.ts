import { describe, expect, it } from "vitest";
import { dataSourceFor } from "@/lib/churn-probability";
import { buildRealDataset } from "@/lib/real-scoring";
import { DEFAULT_METRIC_WEIGHTS } from "@/lib/mock-data";

describe("confidence counts distinct data sources", () => {
  it("maps signals to their source", () => {
    expect(dataSourceFor("payments")).toBe("transactions");
    expect(dataSourceFor("support")).toBe("support");
    expect(dataSourceFor("customers")).toBeNull();
    expect(dataSourceFor(null)).toBeNull();
  });

  const base = {
    customers: [
      { customer_id: "A", name: "A" },
      { customer_id: "B", name: "B" },
      { customer_id: "C", name: "C" },
    ],
    transactions: [{ transaction_id: "t1", customer_id: "A", amount: "100", transaction_date: "2026-08-01" }],
    support: [{ ticket_id: "s1", customer_id: "A", status: "open", satisfaction_score: "3" }],
  };

  it("ticket volume and ticket ratings count as one source (support)", () => {
    const a = buildRealDataset(base as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.id === "A" || c.name === "A")!;
    expect(a.dataCategories).toBe(2);
    expect(a.churnConfidence).toBe("moderate");
  });

  it("survey responses add a genuine third source", () => {
    const withSurvey = { ...base, surveys: [{ customer_id: "A", score: "8" }] };
    const a = buildRealDataset(withSurvey as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!;
    expect(a.dataCategories).toBe(3);
    expect(a.churnConfidence).toBe("high");
  });
});
