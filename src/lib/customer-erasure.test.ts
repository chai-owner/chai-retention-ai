import { describe, it, expect } from "vitest";
import {
  customerRowMatches,
  erasureKeysFor,
  pseudonymFor,
  isPseudonym,
  describeErasure,
  totalDeleted,
  tallyBatchDeletions,
  remainingRowCount,
  type ErasureCounts,
} from "./customer-erasure";

describe("upload history counts", () => {
  it("tallies deleted rows per upload across tables", () => {
    const tally = tallyBatchDeletions([{ batch_id: "a" }, { batch_id: "b" }, { batch_id: "a" }]);
    tallyBatchDeletions([{ batch_id: "a" }, { batch_id: null }, {}], tally);
    expect(tally).toEqual({ a: 3, b: 1 });
  });

  it("subtracts erased rows and never goes negative", () => {
    expect(remainingRowCount(10, 3)).toBe(7);
    expect(remainingRowCount(2, 5)).toBe(0);
    expect(remainingRowCount(null, 1)).toBe(0);
  });
});

const rows = [
  { customer_id: "CUST-1", data: { name: "Acme Labs", email: "ops@acme.test" } },
  { customer_id: "CUST-2", data: { name: "Benton", email: "hi@benton.test" } },
  { customer_id: "acme-labs", data: { customer_name: "Acme Labs" } },
];

const emptyCounts: ErasureCounts = {
  customers: 0,
  transactions: 0,
  support: 0,
  usage: 0,
  surveys: 0,
  aliases: 0,
  scoresAnonymised: 0,
};

describe("customerRowMatches", () => {
  it("matches the stored key", () => {
    expect(customerRowMatches(rows[0]!, "CUST-1")).toBe(true);
  });

  it("matches on email, case and space insensitively", () => {
    expect(customerRowMatches(rows[0]!, "  OPS@ACME.TEST ")).toBe(true);
  });

  it("matches on name and customer_name", () => {
    expect(customerRowMatches(rows[0]!, "acme labs")).toBe(true);
    expect(customerRowMatches(rows[2]!, "Acme Labs")).toBe(true);
  });

  it("does not match a different customer", () => {
    expect(customerRowMatches(rows[1]!, "CUST-1")).toBe(false);
  });

  it("never matches a blank identifier", () => {
    expect(customerRowMatches(rows[0]!, "   ")).toBe(false);
  });
});

describe("erasureKeysFor", () => {
  it("collects every stored key for the person, not just the one typed", () => {
    expect(erasureKeysFor(rows, "Acme Labs").sort()).toEqual(
      ["Acme Labs", "CUST-1", "acme-labs"].sort(),
    );
  });

  it("follows a shared name from an email to the person's duplicate record", () => {
    expect(erasureKeysFor(rows, "ops@acme.test").sort()).toEqual(
      ["CUST-1", "acme-labs", "ops@acme.test"].sort(),
    );
  });

  it("does not drag in an unrelated customer", () => {
    expect(erasureKeysFor(rows, "ops@acme.test")).not.toContain("CUST-2");
  });

  it("keeps the raw identifier so orphaned rows are removed too", () => {
    expect(erasureKeysFor(rows, "CUST-999")).toEqual(["CUST-999"]);
  });

  it("returns nothing for a blank identifier", () => {
    expect(erasureKeysFor(rows, "  ")).toEqual([]);
  });
});

describe("pseudonymFor", () => {
  it("is deterministic per workspace", async () => {
    const a = await pseudonymFor("user-1", "CUST-1");
    const b = await pseudonymFor("user-1", "CUST-1");
    expect(a).toBe(b);
    expect(isPseudonym(a)).toBe(true);
  });

  it("differs across workspaces and customers", async () => {
    const a = await pseudonymFor("user-1", "CUST-1");
    expect(await pseudonymFor("user-2", "CUST-1")).not.toBe(a);
    expect(await pseudonymFor("user-1", "CUST-2")).not.toBe(a);
  });

  it("does not contain the original identifier", async () => {
    const a = await pseudonymFor("user-1", "ops@acme.test");
    expect(a.includes("acme")).toBe(false);
  });

  it("is idempotent on an already-erased key", async () => {
    const a = await pseudonymFor("user-1", "CUST-1");
    expect(await pseudonymFor("user-1", a)).toBe(a);
  });
});

describe("describeErasure", () => {
  it("is honest when nothing matched", () => {
    expect(describeErasure(emptyCounts)).toContain("No records matched");
  });

  it("reports deletions and anonymised scores", () => {
    const counts = { ...emptyCounts, customers: 1, transactions: 4, scoresAnonymised: 3 };
    expect(totalDeleted(counts)).toBe(5);
    expect(describeErasure(counts)).toBe(
      "5 records deleted, 3 scores anonymised so trends stay intact.",
    );
  });

  it("uses singular wording for one record", () => {
    expect(describeErasure({ ...emptyCounts, customers: 1 })).toBe("1 record deleted.");
  });
});
