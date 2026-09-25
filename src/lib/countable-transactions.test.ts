import { describe, it, expect } from "vitest";
import { withCountableTransactions, dealOnlyCustomers } from "./countable-transactions";

const rows = [
  { customer_id: "A", amount: "5000", deal_status: "" },
  { customer_id: "A", amount: "35000", deal_status: "won" }, // A has invoices → deal dropped
  { customer_id: "B", amount: "35000", deal_status: "won" }, // B deal-only → kept
  { customer_id: "B", amount: "90000", deal_status: "open" },
  { customer_id: "C", amount: "20000", deal_status: "lost" },
];

describe("invoices first", () => {
  it("drops open/lost deals and won deals for customers with invoices", () => {
    const out = withCountableTransactions({ transactions: rows } as never);
    expect(out.transactions!.map((r) => [r.customer_id, r.amount])).toEqual([["A", "5000"], ["B", "35000"]]);
  });
  it("identifies deal-only customers", () => {
    const out = withCountableTransactions({ transactions: rows } as never);
    expect([...dealOnlyCustomers(out)]).toEqual(["B"]);
  });
});
