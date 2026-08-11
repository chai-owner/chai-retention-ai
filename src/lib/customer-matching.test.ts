// Tier 1 — orphaned-row detection, suggestions, and saved alias behaviour.
import { describe, it, expect } from "vitest";
import {
  findUnmatched,
  applyAliases,
  customerOptions,
  countAliasUsage,
  groupForSourceId,
  describeCounts,
  signalDatasetKeys,
  type CustomerAlias,
} from "@/lib/customer-matching";
import type { IngestedData } from "@/lib/ingested-data-store";

const base: IngestedData = {
  customers: [
    { customer_id: "CUS-1", name: "Northwind Labs", email: "ops@northwind.com" },
    { customer_id: "CUS-2", name: "Globex Co", email: "team@globex.com" },
  ],
  transactions: [
    { customer_id: "CUS-1", transaction_id: "T1", amount: "10" },
    { customer_id: " cus-1 ", transaction_id: "T2", amount: "20" },
    { customer_id: "Northwind Labs", transaction_id: "T3", amount: "30" },
    { customer_id: "ZZZ-999", transaction_id: "T4", amount: "40" },
  ],
  usage: [{ customer_id: "ZZZ-999", date: "2026-01-01", logins: "3" }],
};

describe("customerOptions", () => {
  it("extracts trimmed ids and names, skipping rows with no id", () => {
    const opts = customerOptions({
      customers: [
        { customer_id: " CUS-1 ", name: "A" },
        { customer_id: "", name: "No id" },
        { customer_id: "CUS-2", company: "Company fallback" },
      ],
    });
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({ customer_id: "CUS-1", name: "A" });
    expect(opts[1].name).toBe("Company fallback");
  });
});

describe("signalDatasetKeys", () => {
  it("lists non-empty datasets other than the customer roster", () => {
    expect(signalDatasetKeys(base).sort()).toEqual(["transactions", "usage"]);
  });
});

describe("findUnmatched", () => {
  it("groups unmatched rows by their raw id and counts them per dataset", () => {
    const groups = findUnmatched(base);
    const zzz = groups.find((g) => g.sourceId === "ZZZ-999")!;
    expect(zzz.total).toBe(2);
    expect(zzz.counts).toEqual({ transactions: 1, usage: 1 });
  });

  it("flags trim/case-only mismatches as trivial with confidence 1", () => {
    const g = findUnmatched(base).find((x) => x.sourceId === " cus-1 ")!;
    expect(g.trivial).toBe(true);
    expect(g.suggestions[0]).toMatchObject({ customer_id: "CUS-1", confidence: 1 });
  });

  it("suggests a customer when the raw id looks like their name", () => {
    const g = findUnmatched(base).find((x) => x.sourceId === "Northwind Labs")!;
    expect(g.suggestions[0].customer_id).toBe("CUS-1");
    expect(g.suggestions[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("orders groups by row volume, highest first", () => {
    const groups = findUnmatched(base);
    const totals = groups.map((g) => g.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it("returns nothing when there is no customer roster to match against", () => {
    expect(findUnmatched({ transactions: base.transactions })).toEqual([]);
  });

  it("never flags rows whose id already matches a customer", () => {
    const ids = findUnmatched(base).map((g) => g.sourceId);
    expect(ids).not.toContain("CUS-1");
  });

  it("excludes source ids that already have a saved alias", () => {
    const aliases: CustomerAlias[] = [{ source: "unknown", source_id: "ZZZ-999", customer_id: "CUS-2", status: "linked" }];
    const ids = findUnmatched(base, aliases).map((g) => g.sourceId);
    expect(ids).not.toContain("ZZZ-999");
  });
});

describe("applyAliases", () => {
  const aliases: CustomerAlias[] = [
    { source: "unknown", source_id: "ZZZ-999", customer_id: "CUS-2", status: "linked" },
    { source: "unknown", source_id: "Northwind Labs", customer_id: "CUS-1", status: "linked" },
    { source: "unknown", source_id: " cus-1 ", customer_id: null, status: "ignored" },
  ];

  it("rewrites linked rows to the canonical customer id across every dataset", () => {
    const out = applyAliases(base, aliases);
    expect(out.transactions.find((r) => r.transaction_id === "T4")!.customer_id).toBe("CUS-2");
    expect(out.transactions.find((r) => r.transaction_id === "T3")!.customer_id).toBe("CUS-1");
    expect(out.usage[0].customer_id).toBe("CUS-2");
  });

  it("drops rows aliased as ignored", () => {
    const out = applyAliases(base, aliases);
    expect(out.transactions.find((r) => r.transaction_id === "T2")).toBeUndefined();
  });

  it("leaves the customer roster untouched", () => {
    const out = applyAliases(base, aliases);
    expect(out.customers).toEqual(base.customers);
  });

  it("is a no-op with no aliases and does not mutate the input", () => {
    const snapshot = JSON.stringify(base);
    expect(applyAliases(base, [])).toBe(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("makes previously orphaned rows count toward scoring inputs", () => {
    const out = applyAliases(base, aliases);
    expect(findUnmatched(out)).toHaveLength(0);
  });
});

describe("saved links reporting", () => {
  it("counts how many raw rows each saved alias resolves", () => {
    const usage = countAliasUsage(base, [
      { source: "unknown", source_id: "ZZZ-999", customer_id: "CUS-2", status: "linked" },
    ]);
    expect(usage["unknown::ZZZ-999"]).toEqual({ transactions: 1, usage: 1 });
  });

  it("returns nothing when there are no aliases", () => {
    expect(countAliasUsage(base, [])).toEqual({});
  });

  it("rebuilds a single-group payload for re-running the wizard", () => {
    const g = groupForSourceId(base, " cus-1 ", { transactions: 1 });
    expect(g.total).toBe(1);
    expect(g.trivial).toBe(true);
    expect(g.suggestions[0].customer_id).toBe("CUS-1");
  });

  it("describes counts in human terms", () => {
    expect(describeCounts({ transactions: 3, support: 1 })).toBe(
      "3 transactions · 1 support tickets",
    );
  });
});

describe("cross-platform identities", () => {
  const data = {
    customers: [
      { customer_id: "CUS-1", customer_name: "Northwind Labs", email: "ops@northwind.co" },
      { customer_id: "CUS-2", customer_name: "Acme Corp", email: "ap@acme.com" },
    ],
    support: [
      { ticket_id: "T1", customer_id: "4471", email: "ops@northwind.co", __source: "zendesk" },
    ],
    transactions: [
      { transaction_id: "X1", customer_id: "4471", amount: "500", __source: "xero" },
    ],
  };

  it("treats the same raw id from two platforms as two separate identities", () => {
    const groups = findUnmatched(data);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.source).sort()).toEqual(["xero", "zendesk"]);
  });

  it("auto-suggests an exact email match and marks it safe to link", () => {
    const zendesk = findUnmatched(data).find((g) => g.source === "zendesk")!;
    expect(zendesk.suggestions[0].customer_id).toBe("CUS-1");
    expect(zendesk.suggestions[0].auto).toBe(true);
    expect(autoLinkable(findUnmatched(data)).map((g) => g.source)).toEqual(["zendesk"]);
  });

  it("applies a saved link only to the platform it was saved for", () => {
    const out = applyAliases(data, [
      { source: "zendesk", source_id: "4471", customer_id: "CUS-1", status: "linked" },
    ]);
    expect(out.support[0].customer_id).toBe("CUS-1");
    expect(out.transactions[0].customer_id).toBe("4471");
  });
});
