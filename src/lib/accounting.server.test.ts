// Accounting hardening: Xero multi-tenant + pagination, FreshBooks account
// resolution and incremental paging, and token-at-rest encryption.
import { describe, it, expect } from "vitest";
import {
  fetchAndNormalize,
  resolveAccountInfo,
  buildAuthorizeUrl,
} from "@/lib/accounting.server";
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
} from "@/lib/connection-key-crypto.server";
import { mockFetch } from "@/test/http";
import { setSupabaseResult } from "@/test/setup";

const XERO_CONN = {
  id: "x1",
  user_id: "user-1",
  provider: "xero",
  access_token: "plain-token", // legacy plaintext row
  refresh_token: null,
  expires_at: null,
  realm_id: null,
  tenant_id: null,
  account_id: null,
  company_name: "2 organisations",
  connected_at: "2026-01-01T00:00:00Z",
  last_synced_at: null,
  tenants: [
    { tenantId: "t-1", tenantName: "Acme AU" },
    { tenantId: "t-2", tenantName: "Acme NZ" },
  ],
};

function contactPage(n: number, count: number) {
  return {
    Contacts: Array.from({ length: count }, (_, i) => ({
      ContactID: `c${n}-${i}`,
      Name: `Contact ${n}-${i}`,
      EmailAddress: `c${n}-${i}@acme.test`,
    })),
  };
}

describe("secret storage", () => {
  it("round-trips encrypted values and tags them", () => {
    const enc = encryptSecret("super-secret-token");
    expect(enc).not.toContain("super-secret-token");
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe("super-secret-token");
  });

  it("returns legacy plaintext values unchanged", () => {
    expect(isEncryptedSecret("legacy-token")).toBe(false);
    expect(decryptSecret("legacy-token")).toBe("legacy-token");
  });
});

describe("resolveAccountInfo", () => {
  it("keeps every Xero organisation and leaves selection open when there are many", async () => {
    mockFetch([
      {
        match: "https://api.xero.com/connections",
        json: [
          { tenantId: "t-1", tenantName: "Acme AU" },
          { tenantId: "t-2", tenantName: "Acme NZ" },
        ],
      },
    ]);
    const info = await resolveAccountInfo("xero", { accessToken: "tok" });
    expect(info.tenants).toHaveLength(2);
    expect(info.tenantId).toBeUndefined();
  });

  it("pins the single Xero organisation automatically", async () => {
    mockFetch([
      {
        match: "https://api.xero.com/connections",
        json: [{ tenantId: "t-9", tenantName: "Solo Ltd" }],
      },
    ]);
    const info = await resolveAccountInfo("xero", { accessToken: "tok" });
    expect(info.tenantId).toBe("t-9");
    expect(info.companyName).toBe("Solo Ltd");
  });

  it("fails when Xero returns no organisations", async () => {
    mockFetch([{ match: "https://api.xero.com/connections", json: [] }]);
    await expect(resolveAccountInfo("xero", { accessToken: "tok" })).rejects.toThrow(
      /no organisations/i,
    );
  });

  it("fails the FreshBooks connection when no account id can be resolved", async () => {
    mockFetch([
      {
        match: "/auth/api/v1/users/me",
        json: { response: { business_memberships: [] } },
      },
    ]);
    await expect(
      resolveAccountInfo("freshbooks", { accessToken: "tok" }),
    ).rejects.toThrow(/didn't return an account/i);
  });

  it("resolves the FreshBooks account id from a business membership", async () => {
    mockFetch([
      {
        match: "/auth/api/v1/users/me",
        json: {
          response: {
            business_memberships: [
              { business: { account_id: "acct-77", name: "Acme Co" } },
            ],
          },
        },
      },
    ]);
    const info = await resolveAccountInfo("freshbooks", { accessToken: "tok" });
    expect(info.accountId).toBe("acct-77");
    expect(info.companyName).toBe("Acme Co");
  });
});

describe("Xero sync", () => {
  it("pages contacts and syncs every connected organisation", async () => {
    setSupabaseResult("accounting_connections", { data: XERO_CONN });
    const http = mockFetch([
      { match: "Contacts?page=1", json: contactPage(1, 100) },
      { match: "Contacts?page=2", json: contactPage(2, 5) },
      { match: "Invoices", json: { Invoices: [] } },
    ]);

    const datasets = await fetchAndNormalize("user-1", "xero", null);
    const customers = datasets.find((d) => d.key === "customers")!;
    // 105 contacts per tenant, two tenants.
    expect(customers.rows).toHaveLength(210);

    const tenantHeaders = http.requests
      .filter((r) => r.url.includes("Contacts"))
      .map((r) => r.headers["xero-tenant-id"]);
    expect(new Set(tenantHeaders)).toEqual(new Set(["t-1", "t-2"]));
  });

  it("sends If-Modified-Since for incremental runs and honours a pinned org", async () => {
    setSupabaseResult("accounting_connections", {
      data: { ...XERO_CONN, tenant_id: "t-2" },
    });
    const http = mockFetch([
      { match: "Contacts", json: { Contacts: [] } },
      { match: "Invoices", json: { Invoices: [] } },
    ]);

    await fetchAndNormalize("user-1", "xero", "2026-05-01T00:00:00Z");

    const req = http.find("Contacts")!;
    expect(req.headers["if-modified-since"]).toBeTruthy();
    expect(
      http.requests.every((r) => r.headers["xero-tenant-id"] === "t-2"),
    ).toBe(true);
  });
});

describe("FreshBooks sync", () => {
  const FB_CONN = {
    id: "f1",
    user_id: "user-1",
    provider: "freshbooks",
    access_token: "plain-token",
    refresh_token: null,
    expires_at: null,
    realm_id: null,
    tenant_id: null,
    account_id: "acct-1",
    company_name: "Acme",
    connected_at: "2026-01-01T00:00:00Z",
    last_synced_at: null,
    tenants: [],
  };

  it("stops paging clients once records fall behind the since watermark", async () => {
    setSupabaseResult("accounting_connections", { data: FB_CONN });
    const http = mockFetch([
      {
        match: "/users/clients",
        json: {
          response: {
            result: {
              pages: 3,
              clients: [
                { id: 1, organization: "Fresh", email: "a@x.test", updated: "2026-06-01 10:00:00" },
                { id: 2, organization: "Stale", email: "b@x.test", updated: "2026-01-01 10:00:00" },
              ],
            },
          },
        },
      },
      {
        match: "/invoices/invoices",
        json: { response: { result: { pages: 1, invoices: [] } } },
      },
    ]);

    const datasets = await fetchAndNormalize("user-1", "freshbooks", "2026-05-01T00:00:00Z");
    const customers = datasets.find((d) => d.key === "customers")!;
    expect(customers.rows.map((r) => r[1])).toEqual(["Fresh"]);
    // Stopped after the first page instead of walking all three.
    expect(http.requests.filter((r) => r.url.includes("/users/clients"))).toHaveLength(1);
  });

  it("refuses to sync a connection with no account id", async () => {
    setSupabaseResult("accounting_connections", { data: { ...FB_CONN, account_id: null } });
    mockFetch([]);
    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.toThrow(
      /no account id/i,
    );
  });
});

describe("token lifecycle", () => {
  const BASE = {
    id: "f1",
    user_id: "user-1",
    provider: "freshbooks",
    access_token: encryptSecret("old-access"),
    refresh_token: encryptSecret("old-refresh"),
    account_id: "acct-1",
    realm_id: null,
    tenant_id: null,
    company_name: "Acme",
    connected_at: "2026-01-01T00:00:00Z",
    last_synced_at: null,
    tenants: [],
  };
  const past = new Date(Date.now() - 60_000).toISOString();

  it("refreshes proactively before the access token expires and retries with the new token", async () => {
    setSupabaseResult("accounting_connections", {
      data: { ...BASE, expires_at: past, refresh_token_expires_at: null, status: "connected" },
    });
    const http = mockFetch([
      {
        match: "/auth/oauth/token",
        json: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 },
      },
      { match: "/users/clients", json: { response: { result: { pages: 1, clients: [] } } } },
      { match: "/invoices/invoices", json: { response: { result: { pages: 1, invoices: [] } } } },
    ]);

    await fetchAndNormalize("user-1", "freshbooks", null);

    expect(http.find("/auth/oauth/token")).toBeTruthy();
    const apiCall = http.find("/users/clients")!;
    expect(apiCall.headers.authorization).toBe("Bearer new-access");
  });

  it("stops retrying and asks the user to reconnect once the refresh token has expired", async () => {
    setSupabaseResult("accounting_connections", {
      data: {
        ...BASE,
        expires_at: past,
        refresh_token_expires_at: past,
        status: "connected",
      },
    });
    const http = mockFetch([{ match: "/auth/oauth/token", status: 400, json: { error: "x" } }]);

    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.toThrow(/reconnect/i);
    // Never burned the dead refresh token on the provider.
    expect(http.requests).toHaveLength(0);
  });

  it("refuses to sync a connection already flagged for reauthorisation", async () => {
    setSupabaseResult("accounting_connections", {
      data: { ...BASE, expires_at: null, status: "needs_reauth" },
    });
    mockFetch([]);
    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.toThrow(/reconnect/i);
  });

  it("flags the connection for reauthorisation when the provider rejects the refresh", async () => {
    setSupabaseResult("accounting_connections", {
      data: { ...BASE, expires_at: past, refresh_token_expires_at: null, status: "connected" },
    });
    mockFetch([{ match: "/auth/oauth/token", status: 401, json: { error: "invalid_grant" } }]);
    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.toThrow(/reconnect/i);
  });

  it("never leaks token values into provider error messages", async () => {
    setSupabaseResult("accounting_connections", {
      data: { ...BASE, expires_at: null, status: "connected" },
    });
    mockFetch([
      {
        match: "/users/clients",
        status: 500,
        json: { error: "boom", access_token: "leaked-token-value" },
      },
    ]);
    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.toThrow(
      /FreshBooks clients failed/,
    );
    await expect(fetchAndNormalize("user-1", "freshbooks", null)).rejects.not.toThrow(
      /leaked-token-value/,
    );
  });
});

describe("Xero authorize URL scopes", () => {
  it("requests exactly the confirmed accepted scope set", () => {
    process.env["XERO_CLIENT_ID"] = "xero-client";
    process.env["XERO_CLIENT_SECRET"] = "xero-secret";
    const url = buildAuthorizeUrl("xero", "https://app.test/cb", "state-123");
    const scope = new URL(url).searchParams.get("scope");
    expect(scope).toBe(
      "openid profile email accounting.contacts.read accounting.invoices.read offline_access",
    );
    expect(scope).not.toContain("accounting.transactions.read");
  });
});
