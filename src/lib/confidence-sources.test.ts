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
    transactions: ["2026-06-01", "2026-07-01", "2026-08-01"].map((d, i) => ({ transaction_id: `t${i}`, customer_id: "A", amount: "100", transaction_date: d })),
    support: ["2026-06-02", "2026-07-02", "2026-08-02"].map((d, i) => ({ ticket_id: `s${i}`, customer_id: "A", status: "open", satisfaction_score: "3", created_at: d })),
  };

  it("ticket volume and ticket ratings count as one source (support)", () => {
    const a = buildRealDataset(base as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.id === "A" || c.name === "A")!;
    expect(a.dataCategories).toBe(2);
    expect(a.churnConfidence).toBe("moderate");
  });

  it("survey responses add a genuine third source", () => {
    const withSurvey = { ...base, surveys: ["2026-06-03", "2026-07-03", "2026-08-03"].map((d) => ({ customer_id: "A", score: "8", submitted_at: d })) };
    const a = buildRealDataset(withSurvey as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!;
    expect(a.dataCategories).toBe(3);
    expect(a.churnConfidence).toBe("high");
  });

  it("a kind with fewer than 3 dated records doesn't count (evidence weighting)", () => {
    const thin = { ...base, surveys: [{ customer_id: "A", score: "8", submitted_at: "2026-08-03" }] };
    const a = buildRealDataset(thin as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!;
    const b = buildRealDataset(base as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!;
    expect(a.churnConfidence).toBe("moderate");
    expect(a.confidenceReason).toBe("based on a single survey response");
    expect(a.health).toBe(buildRealDataset(thin as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!.health);
    expect(b.confidenceReason).toBeNull();
  });
});
