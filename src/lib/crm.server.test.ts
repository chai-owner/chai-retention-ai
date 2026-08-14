// Tier 3 — CRM syncs (Salesforce + HubSpot) through the connector gateway,
// plus the incremental cursor bookkeeping shared by manual and daily syncs.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockFetch } from "@/test/http";
import { setSupabaseResult, supabaseMock } from "@/test/setup";

const getConnectionKeyForUser = vi.fn(async () => "conn-key" as string | null);
vi.mock("@/lib/app-user-connections.server", () => ({
  getConnectionKeyForUser: (...a: unknown[]) => getConnectionKeyForUser(...(a as [])),
}));

// Salesforce goes through the per-app-user connector helper; route it into the
// same fetch mock so tests can assert on the SOQL that gets sent.
vi.mock("@/integrations/lovable/appUserConnector", () => ({
  callAsAppUser: async (opts: { gatewayBaseUrl: string; connectorId: string; path: string }) =>
    fetch(`${opts.gatewayBaseUrl}/${opts.connectorId}${opts.path}`),
}));

import { runCrmSync, getCrmSince, markCrmSynced } from "@/lib/crm.server";

beforeEach(() => {
  process.env.LOVABLE_API_KEY = "lovable-key";
  getConnectionKeyForUser.mockResolvedValue("conn-key");
});

describe("Salesforce sync", () => {
  const accounts = {
    records: [
      {
        Id: "001A",
        Name: "Acme Corp",
        CreatedDate: "2025-11-01T00:00:00Z",
        AnnualRevenue: 120000,
        Type: "Customer",
        BillingCountry: "US",
      },
    ],
  };
  const opps = {
    records: [
      {
        Id: "006A",
        AccountId: "001A",
        Name: "Renewal FY26",
        Amount: 5000,
        CloseDate: "2026-03-15",
        StageName: "Closed Won",
      },
    ],
  };

  function routeSoql() {
    return [
      { match: "FROM+Account", json: accounts },
      { match: "FROM%20Account", json: accounts },
      { match: "Opportunity", json: opps },
    ];
  }

  it("normalizes accounts and opportunities into ChAi datasets", async () => {
    mockFetch(routeSoql());
    const datasets = await runCrmSync("salesforce", "user-1", 200, null);

    const customers = datasets.find((d) => d.key === "customers")!;
    const transactions = datasets.find((d) => d.key === "transactions")!;
    // Annual revenue is converted to a monthly figure.
    expect(customers.rows[0]).toEqual(["001A", "Acme Corp", "", "2025-11-01", "10000", "Customer", "US"]);
    expect(transactions.rows[0]).toEqual(["001A", "006A", "5000", "2026-03-15", "Renewal FY26", "USD"]);
  });

  it("adds a SystemModstamp filter for incremental pulls", async () => {
    const http = mockFetch(routeSoql());
    await runCrmSync("salesforce", "user-1", 200, "2026-05-01T00:00:00Z");
    const queries = http.urls().map((u) => decodeURIComponent(u));
    // Account + Opportunity pulls are incremental; the contact-email lookup is
    // a separate roster query and keeps its own filter.
    const incremental = queries.filter((q) => /FROM (Account|Opportunity)/.test(q));
    expect(incremental.length).toBeGreaterThan(0);
    expect(incremental.every((q) => q.includes("WHERE SystemModstamp >= 2026-05-01T00:00:00Z"))).toBe(true);
  });

  it("does not filter on the first full pull", async () => {
    const http = mockFetch(routeSoql());
    await runCrmSync("salesforce", "user-1", 200, null);
    expect(decodeURIComponent(http.urls()[0])).not.toContain("WHERE");
  });

  it("tells the user to connect Salesforce when no key is stored", async () => {
    getConnectionKeyForUser.mockResolvedValue(null);
    await expect(runCrmSync("salesforce", "user-1", 10, null)).rejects.toThrow(
      /Salesforce isn't connected/,
    );
  });

  it("surfaces provider errors with the status code", async () => {
    mockFetch([{ match: "connector-gateway", status: 400, body: "MALFORMED_QUERY" }]);
    await expect(runCrmSync("salesforce", "user-1", 10, null)).rejects.toThrow(
      /Salesforce request failed \[400\]/,
    );
  });
});

describe("HubSpot sync", () => {
  const companies = {
    results: [
      {
        id: "701",
        properties: {
          name: "Globex",
          createdate: "2025-09-10T00:00:00Z",
          annualrevenue: "240000",
          industry: "Manufacturing",
          country: "CA",
        },
      },
    ],
  };
  const deals = {
    results: [
      {
        id: "D1",
        properties: { dealname: "Expansion", amount: "7500", closedate: "2026-02-01T00:00:00Z" },
        associations: { companies: { results: [{ id: "701" }] } },
      },
    ],
  };

  it("normalizes companies and deals, linking deals to their company", async () => {
    mockFetch([
      { match: "/objects/companies", json: companies },
      { match: "/objects/deals", json: deals },
    ]);
    const datasets = await runCrmSync("hubspot", "user-1", 100, null);

    expect(datasets.find((d) => d.key === "customers")!.rows[0]).toEqual([
      "701", "Globex", "", "2025-09-10", "20000", "Manufacturing", "CA",
    ]);
    expect(datasets.find((d) => d.key === "transactions")!.rows[0]).toEqual([
      "701", "D1", "7500", "2026-02-01", "Expansion", "USD",
    ]);
  });

  it("authenticates against the Lovable gateway, never HubSpot directly", async () => {
    const http = mockFetch([
      { match: "/objects/companies", json: companies },
      { match: "/objects/deals", json: deals },
    ]);
    await runCrmSync("hubspot", "user-1", 100, null);

    for (const req of http.requests) {
      expect(req.url.startsWith("https://connector-gateway.lovable.dev/hubspot")).toBe(true);
      expect(req.headers.authorization).toBe("Bearer lovable-key");
      expect(req.headers["x-connection-api-key"]).toBe("conn-key");
    }
  });

  it("uses the search API with a last-modified filter for delta pulls", async () => {
    const http = mockFetch([
      { match: "/companies/search", json: companies },
      { match: "/deals/search", json: deals },
    ]);
    const since = "2026-05-01T00:00:00.000Z";
    await runCrmSync("hubspot", "user-1", 100, since);

    const req = http.find("/companies/search")!;
    expect(req.method).toBe("POST");
    const body = JSON.parse(req.body!);
    expect(body.filterGroups[0].filters[0]).toEqual({
      propertyName: "hs_lastmodifieddate",
      operator: "GTE",
      value: String(new Date(since).getTime()),
    });
  });

  it("explains rate limiting in plain language", async () => {
    mockFetch([{ match: "connector-gateway", status: 429, json: {} }]);
    await expect(runCrmSync("hubspot", "user-1", 100, null)).rejects.toThrow(/rate limit/i);
  });

  it("returns no datasets when the CRM has nothing new", async () => {
    mockFetch([{ match: "connector-gateway", json: { results: [] } }]);
    expect(await runCrmSync("hubspot", "user-1", 100, null)).toEqual([]);
  });
});

describe("incremental sync bookkeeping", () => {
  it("reads the stored cursor for a provider", async () => {
    setSupabaseResult("crm_sync_state", { data: { last_synced_at: "2026-05-01T00:00:00Z" } });
    expect(await getCrmSince("user-1", "hubspot")).toBe("2026-05-01T00:00:00Z");
  });

  it("returns null before the first sync so the full history is pulled", async () => {
    setSupabaseResult("crm_sync_state", { data: null });
    expect(await getCrmSince("user-1", "hubspot")).toBeNull();
  });

  it("stores one cursor per user and provider", async () => {
    await markCrmSynced("user-1", "salesforce", "2026-06-01T00:00:00Z");
    const builder = supabaseMock.from.mock.results[0].value as Record<string, any>;
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", provider: "salesforce", last_synced_at: "2026-06-01T00:00:00Z" },
      { onConflict: "user_id,provider" },
    );
  });
});

describe("unsupported providers", () => {
  it("rejects an unknown CRM", async () => {
    await expect(
      runCrmSync("mystery" as never, "user-1", 10, null),
    ).rejects.toThrow(/Unsupported CRM provider/);
  });
});
