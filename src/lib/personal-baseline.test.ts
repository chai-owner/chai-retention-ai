import { describe, expect, it } from "vitest";
import { blendScore, compareRhythm, compareTrend, DAY } from "@/lib/personal-baseline";
import { isCountableTransaction, withCountableTransactions } from "@/lib/countable-transactions";
import { zohoDealStatus } from "@/lib/zoho.server";
import { buildRealDataset } from "@/lib/real-scoring";
import { DEFAULT_METRIC_WEIGHTS } from "@/lib/mock-data";

const NOW = Date.parse("2026-09-25T00:00:00Z");
const ago = (n: number) => NOW - n * DAY;
const iso = (n: number) => new Date(ago(n)).toISOString().slice(0, 10);

describe("compareTrend", () => {
  it("needs 3 records in the normal period", () => {
    expect(compareTrend([{ date: ago(40), value: 1 }, { date: ago(50), value: 1 }, { date: ago(5), value: 1 }], "average", "higher", NOW)).toBeNull();
  });
  it("scores steady at 75, halved at 25", () => {
    const base = [40, 60, 80].map((n) => ({ date: ago(n), value: 100 }));
    expect(compareTrend([...base, { date: ago(5), value: 100 }], "average", "higher", NOW)!.score).toBe(75);
    expect(compareTrend([...base, { date: ago(5), value: 50 }], "average", "higher", NOW)!.score).toBe(25);
  });
  it("treats zero recent records as a real drop for counts", () => {
    const base = [40, 50, 60, 70, 80, 90].map((n) => ({ date: ago(n), value: 1 }));
    const r = compareTrend(base, "sum", "higher", NOW)!;
    expect(r.current).toBe(0);
    expect(r.score).toBe(0);
  });
  it("penalises rising tickets when lower is better", () => {
    const base = [40, 70, 100].map((n) => ({ date: ago(n), value: 1 }));
    const recent = [1, 2, 3, 4, 5, 6].map((n) => ({ date: ago(n), value: 1 }));
    expect(compareTrend([...base, ...recent], "sum", "lower", NOW)!.score).toBeLessThan(40);
  });
});

describe("compareRhythm", () => {
  it("uses the median gap and flags long silences", () => {
    const r = compareRhythm([20, 27, 34, 41, 48].map(ago), NOW)!;
    expect(r.normal).toBe(7);
    expect(r.current).toBe(20);
    expect(r.score).toBeLessThan(20);
  });
  it("returns null with fewer than 3 dates", () => {
    expect(compareRhythm([ago(5), ago(10)], NOW)).toBeNull();
  });
});

describe("blendScore", () => {
  it("falls back when there is no personal comparison", () => {
    expect(blendScore(null, 42)).toEqual({ score: 42, basis: "fallback" });
  });
});

describe("won deals only", () => {
  it("classifies Zoho stages", () => {
    expect(zohoDealStatus("Closed Won", 100)).toBe("won");
    expect(zohoDealStatus("Closed Lost", 0)).toBe("lost");
    expect(zohoDealStatus("Closed-Lost to Competition", 0)).toBe("lost");
    expect(zohoDealStatus("Negotiation/Review", 90)).toBe("open");
    expect(zohoDealStatus("Signed", 100)).toBe("won");
  });
  it("keeps invoices and won deals, drops open and lost deals", () => {
    expect(isCountableTransaction({ amount: "5" })).toBe(true);
    expect(isCountableTransaction({ deal_status: "won" })).toBe(true);
    expect(isCountableTransaction({ deal_status: "open" })).toBe(false);
    expect(isCountableTransaction({ deal_status: "lost" })).toBe(false);
    const out = withCountableTransactions({
      transactions: [{ transaction_id: "1", deal_status: "won" }, { transaction_id: "2", deal_status: "open" }, { transaction_id: "3" }],
    } as never);
    expect(out.transactions!.map((t) => t.transaction_id)).toEqual(["1", "3"]);
  });
});

describe("customer page uses the same personal comparison", () => {
  it("names the personal rhythm in the reason text", () => {
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const data = {
        customers: [{ customer_id: "A", name: "A" }, { customer_id: "B", name: "B" }, { customer_id: "C", name: "C" }],
        transactions: [
          ...[60, 67, 74, 81, 88, 95].map((n, i) => ({ transaction_id: `a${i}`, customer_id: "A", amount: "100", transaction_date: iso(n) })),
          { transaction_id: "b1", customer_id: "B", amount: "100", transaction_date: iso(2) },
          { transaction_id: "c1", customer_id: "C", amount: "100", transaction_date: iso(3) },
        ],
      };
      const a = buildRealDataset(data as never, { ...DEFAULT_METRIC_WEIGHTS }, null).customers.find((c) => c.name === "A")!;
      const f = a.factors.find((x) => x.label === "No recent purchases")!;
      expect(f).toBeTruthy();
      expect(f.detail).toContain("usually goes about 7 days");
    } finally {
      Date.now = realNow;
    }
  });
});
