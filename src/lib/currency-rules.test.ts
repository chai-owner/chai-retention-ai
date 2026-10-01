import { describe, expect, it } from "vitest";
import { applyAccountCurrency, captureRowCurrency, classifyRowCurrency, splitMoneyCell } from "./currency-rules";
import { formatMoney } from "./money";

const oldUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? "compact" : "standard",
  }).format(n);

describe("money formatting", () => {
  it("keeps USD byte-for-byte identical", () => {
    for (const n of [0, 1, -1200, 999.6, 12500, 1_250_000, -2_000_000]) expect(formatMoney(n, "USD")).toBe(oldUsd(n));
  });
  it("formats ZAR as R 12,500", () => {
    expect(formatMoney(12500, "ZAR")).toBe("R 12,500");
    expect(formatMoney(-1200, "ZAR")).toBe("-R 1,200");
    expect(formatMoney(0, "ZAR")).toBe("R 0");
    expect(formatMoney(1_200_000, "ZAR")).toBe("R 1.2M");
    expect(formatMoney(12.5, "ZAR", { decimals: 2 })).toBe("R 12.50");
  });
});

describe("currency rules", () => {
  it("classifies rows", () => {
    expect(classifyRowCurrency({ currency: "" }, "ZAR").status).toBe("unknown");
    expect(classifyRowCurrency({ currency: "ZAR" }, "ZAR").status).toBe("home");
    expect(classifyRowCurrency({ currency: "USD" }, "ZAR").status).toBe("foreign");
    expect(classifyRowCurrency({ currency: "USD", __source: "quickbooks" }, "USD").status).toBe("home");
    expect(classifyRowCurrency({ currency: "USD", __source: "quickbooks" }, "ZAR").status).toBe("unconfirmed");
    expect(classifyRowCurrency({ currency: "USD", __source: "quickbooks", currency_verified: "1" }, "ZAR").status).toBe("foreign");
  });
  it("blanks foreign amounts but keeps the row and its date", () => {
    const data = { transactions: [{ customer_id: "a", amount: "100", occurred_at: "2026-01-01", currency: "ZAR" }] };
    const { data: out, exclusion } = applyAccountCurrency(data, "USD");
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0]!.amount).toBe("");
    expect(out.transactions[0]!.occurred_at).toBe("2026-01-01");
    expect(exclusion.excludedRows).toBe(1);
  });
  it("returns the same object when nothing is excluded", () => {
    const data = { transactions: [{ amount: "5", currency: "USD" }] };
    expect(applyAccountCurrency(data, "USD").data).toBe(data);
  });
});

describe("upload currency capture", () => {
  it("reads currency from amount cells", () => {
    expect(splitMoneyCell("R 1,200")).toEqual({ value: "1200", code: "ZAR" });
    expect(splitMoneyCell("ZAR 1200.50")).toEqual({ value: "1200.50", code: "ZAR" });
    expect(splitMoneyCell("$1,200")).toEqual({ value: "1200", code: "USD" });
    expect(splitMoneyCell("1200")).toEqual({ value: "1200", code: "" });
  });
  it("keeps a row's own currency and flags mixed rows", () => {
    expect(captureRowCurrency({ amount: "R 10", currency: "" }, ["amount"]).currency).toBe("ZAR");
    expect(captureRowCurrency({ amount: "R 10", currency: "USD" }, ["amount"]).currency).toBe("USD");
    expect(captureRowCurrency({ amount: "R 10", amount_due: "$5", currency: "" }, ["amount", "amount_due"]).currency).toBe("MIXED");
  });
});
