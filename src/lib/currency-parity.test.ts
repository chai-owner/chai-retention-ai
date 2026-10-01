// Both scoring paths (customer page / live, and the nightly score) must leave
// out foreign-currency amounts in exactly the same way (currency-rules.ts).
import { describe, expect, it } from "vitest";
import { buildRealDataset } from "@/lib/real-scoring";
import { scoreCustomers } from "@/lib/customer-scoring";
import { DEFAULT_METRIC_WEIGHTS, type PlannerMetric } from "@/lib/mock-data";
import { makeProfile, daysAgo } from "@/test/fixtures";
import type { IngestedData } from "@/lib/ingested-data-store";

const NOW = Date.now();
const metrics: PlannerMetric[] = [
  { name: "Average order value", why: "", churn: "", cadence: "Monthly", benchmark: "", benchmarkScore: 70, category: "Revenue", unit: "$", decimals: 0, valueAt0: 0, valueAt100: 5000 },
  { name: "Days since last purchase", why: "", churn: "", cadence: "Monthly", benchmark: "", benchmarkScore: 70, category: "Engagement", unit: "days", decimals: 0, valueAt0: 180, valueAt100: 0 },
];

/** 6 customers × 4 invoices; customers C1–C3 have their newest invoices in ZAR. */
function mixed(): IngestedData {
  const customers = Array.from({ length: 6 }, (_, i) => ({ customer_id: `C${i + 1}`, name: `Cust ${i + 1}` }));
  const transactions = customers.flatMap((c, i) =>
    [0, 1, 2, 3].map((k) => ({
      customer_id: c.customer_id,
      transaction_id: `${c.customer_id}-${k}`,
      amount: String(500 + i * 300 + k * 50 + (i < 3 && k < 2 ? 9000 : 0)),
      transaction_date: daysAgo(5 + k * 25 + i),
      currency: i < 3 && k < 2 ? "ZAR" : "USD",
    })),
  );
  return { customers, transactions };
}

/** The same data with foreign amounts blanked by hand. */
function cleanedByHand(d: IngestedData): IngestedData {
  return {
    ...d,
    transactions: d.transactions!.map((r) => (r.currency === "ZAR" ? { ...r, amount: "" } : r)),
  };
}

/** The same data with no currencies at all: what the app did before. */
function noCurrency(d: IngestedData): IngestedData {
  return { ...d, transactions: d.transactions!.map(({ currency: _c, ...r }) => r) };
}

const nightly = (d: IngestedData) => scoreCustomers(metrics, d, { currency: "USD", now: NOW, cadence: "Monthly" });
const live = (d: IngestedData) =>
  buildRealDataset(d, DEFAULT_METRIC_WEIGHTS, makeProfile({ metrics, dataCurrency: "USD" })).customers.map((c) => ({
    id: c.id,
    health: c.health,
    revenue: c.revenue,
    churn: c.churnProbability,
  }));

describe("mixed-currency parity between the two scoring paths", () => {
  it("nightly score leaves out exactly the foreign amounts", () => {
    expect(nightly(mixed())).toEqual(nightly(cleanedByHand(mixed())));
    expect(nightly(mixed())).not.toEqual(nightly(noCurrency(mixed())));
  });

  it("customer page leaves out exactly the foreign amounts", () => {
    expect(live(mixed())).toEqual(live(cleanedByHand(mixed())));
    expect(live(mixed())).not.toEqual(live(noCurrency(mixed())));
  });

  it("both paths still count the foreign rows' dates", () => {
    const n = nightly(mixed()).find((s) => s.customer_id === "C1")!;
    const days = n.score_breakdown.find((b) => "metric" in b && b.metric === "Days since last purchase") as
      | { value?: number | null }
      | undefined;
    // C1's newest invoice (5 days ago) is in ZAR, and it still counts as a purchase.
    expect(days?.value).toBe(5);
  });
});
