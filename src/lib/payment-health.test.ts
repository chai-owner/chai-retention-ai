import { describe, expect, it } from "vitest";
import {
  maxDaysOverdueByCustomer,
  overdueInvoices,
  paymentHealthScore,
  rowDaysOverdue,
  worstOverdueInvoice,
} from "@/lib/payment-health";

const NOW = Date.parse("2026-06-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

describe("rowDaysOverdue", () => {
  it("is zero when nothing is outstanding", () => {
    expect(rowDaysOverdue({ due_date: daysAgo(40), amount_due: "0" }, NOW)).toBe(0);
    expect(rowDaysOverdue({ due_date: daysAgo(40) }, NOW)).toBe(0);
  });

  it("is zero when the invoice is not yet due", () => {
    expect(rowDaysOverdue({ due_date: daysAgo(-5), amount_due: "120" }, NOW)).toBe(0);
  });

  it("counts days past the due date", () => {
    expect(rowDaysOverdue({ due_date: daysAgo(45), amount_due: "120" }, NOW)).toBe(45);
  });

  it("falls back to the stored value when there is no due date", () => {
    expect(rowDaysOverdue({ amount_due: "50", days_overdue: "12" }, NOW)).toBe(12);
  });
});

describe("paymentHealthScore", () => {
  it("scores a current account at 100", () => {
    expect(paymentHealthScore(0)).toBe(100);
  });

  it("keeps each band inside its range and slopes downward", () => {
    expect(paymentHealthScore(1)).toBe(70);
    expect(paymentHealthScore(30)).toBe(40);
    expect(paymentHealthScore(15)).toBeGreaterThan(40);
    expect(paymentHealthScore(15)).toBeLessThan(70);
    expect(paymentHealthScore(31)).toBe(40);
    expect(paymentHealthScore(60)).toBeCloseTo(15, 1);
    expect(paymentHealthScore(61)).toBe(15);
    expect(paymentHealthScore(90)).toBeLessThan(15);
    expect(paymentHealthScore(200)).toBe(0);
  });
});

describe("overdue aggregation", () => {
  const rows = [
    { customer_id: "a", transaction_id: "INV-1", due_date: daysAgo(10), amount_due: "100", transaction_date: daysAgo(20) },
    { customer_id: "a", transaction_id: "INV-2", due_date: daysAgo(50), amount_due: "250", transaction_date: daysAgo(60) },
    { customer_id: "a", transaction_id: "INV-3", due_date: daysAgo(400), amount_due: "999", transaction_date: daysAgo(400) },
    { customer_id: "b", transaction_id: "INV-4", due_date: daysAgo(5), amount_due: "0", transaction_date: daysAgo(9) },
  ];

  it("ignores invoices outside the 90-day window and settled invoices", () => {
    const ids = overdueInvoices(rows, NOW).map((i) => i.transactionId);
    expect(ids).toEqual(["INV-2", "INV-1"]);
  });

  it("takes the worst days overdue per customer", () => {
    const worst = maxDaysOverdueByCustomer(rows, NOW);
    expect(worst.get("a")).toBe(50);
    expect(worst.has("b")).toBe(false);
  });

  it("surfaces the most overdue open invoice for a customer", () => {
    const inv = worstOverdueInvoice(rows, "a", NOW)!;
    expect(inv.transactionId).toBe("INV-2");
    expect(inv.amountDue).toBe(250);
    expect(worstOverdueInvoice(rows, "b", NOW)).toBeNull();
  });

  it("returns nothing when no payment data exists", () => {
    expect(overdueInvoices([{ customer_id: "a", amount: "10" }], NOW)).toEqual([]);
  });
});
