import { describe, it, expect } from "vitest";
import { findErasureCandidates, describePreview } from "./customer-erasure";

const customers = [
  { customer_id: "hs-1", data: { name: "Northstar Legal", email: "ops@northstarlegal.com" }, source: "hubspot", at: "2026-09-01" },
  { customer_id: "erased-abc", data: { name: "Bekah Old" }, source: "csv" },
];
const support = [
  { customer_id: "392", data: { __source: "zendesk", customer_name: "bekahpillay", email: "bekahpillay@gmail.com" }, at: "2026-09-20" },
  { customer_id: "392", data: { __source: "zendesk", email: "bekahpillay@gmail.com" }, at: "2026-09-22" },
];

describe("findErasureCandidates", () => {
  it("partial, case-insensitive on name and email", () => {
    const r = findErasureCandidates(customers, support, "BEKAH");
    expect(r.map((c) => c.key)).toEqual(["392"]);
    expect(r[0].sources).toEqual(["Zendesk"]);
    expect(r[0].lastActivity).toBe("2026-09-22");
    expect(findErasureCandidates(customers, support, "northstar")[0].key).toBe("hs-1");
  });
  it("exact ID and exact email still work and sort first", () => {
    expect(findErasureCandidates(customers, support, "hs-1")[0]).toMatchObject({ key: "hs-1", exact: true });
    expect(findErasureCandidates(customers, support, "bekahpillay@gmail.com")[0].exact).toBe(true);
  });
  it("never returns already-erased pseudonyms or too-short queries", () => {
    expect(findErasureCandidates(customers, support, "old")).toEqual([]);
    expect(findErasureCandidates(customers, support, "b")).toEqual([]);
  });
  it("describes a preview", () => {
    expect(describePreview({ keys: [], customers: 0, transactions: 0, support: 3, usage: 0, surveys: 0, aliases: 0, conversations: 1, signals: 2, scores: 0 }))
      .toBe("3 tickets, 1 conversation, 2 signals");
  });
});
