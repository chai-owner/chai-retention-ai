import { describe, it, expect } from "vitest";
import { findDuplicateCustomers, mergeRoster, customerIdentities } from "@/lib/customer-merge";
import type { CustomerAlias } from "@/lib/customer-matching";
import type { IngestedData } from "@/lib/ingested-data-store";

const data: IngestedData = {
  customers: [
    { customer_id: "HS-1", __source: "hubspot", customer_name: "Acme Corporation", email: "ops@acme.com", plan: "Pro" },
    { customer_id: "XR-9", __source: "xero", customer_name: "Acme Corp", email: "ops@acme.com" },
    { customer_id: "ZD-3", __source: "zendesk", customer_name: "Brightpath Health", email: "" },
  ],
  transactions: [{ transaction_id: "t1", customer_id: "XR-9", __source: "xero", amount: "100" }],
};

describe("findDuplicateCustomers", () => {
  it("clusters the same company across platforms by email", () => {
    const groups = findDuplicateCustomers(data, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.master.customer_id).toBe("HS-1");
    expect(groups[0]!.members.map((m) => m.customer_id)).toEqual(["XR-9"]);
  });

  it("skips records already decided", () => {
    const aliases: CustomerAlias[] = [
      { source: "xero", source_id: "XR-9", customer_id: "HS-1", status: "linked" },
    ];
    expect(findDuplicateCustomers(data, aliases)).toHaveLength(0);
  });
});

describe("mergeRoster", () => {
  const aliases: CustomerAlias[] = [
    { source: "xero", source_id: "XR-9", customer_id: "HS-1", status: "linked" },
  ];

  it("folds duplicates into the master record", () => {
    const out = mergeRoster(data, aliases);
    expect(out.customers!.map((c) => c.customer_id)).toEqual(["HS-1", "ZD-3"]);
    expect(out.customers![0]!.plan).toBe("Pro");
  });

  it("is a no-op without aliases", () => {
    expect(mergeRoster(data, [])).toBe(data);
  });
});

describe("customerIdentities", () => {
  it("lists the master id plus linked platform ids", () => {
    const ids = customerIdentities(data, [
      { source: "xero", source_id: "XR-9", customer_id: "HS-1", status: "linked" },
    ], "HS-1");
    expect(ids[0]).toMatchObject({ source: "hubspot", source_id: "HS-1", primary: true });
    expect(ids[1]).toMatchObject({ source: "xero", source_id: "XR-9" });
  });
});
