// Tier 3 — Zendesk: normalization, incremental cursor, token refresh, errors.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildZendeskAuthorizeUrl,
  exchangeZendeskCode,
  getZendeskCreds,
  hasZendeskCreds,
  normalizeSubdomain,
  getZendeskRedirectUri,
  verifyZendeskConnection,
  syncZendeskForUser,
  ZENDESK_SCOPE,
} from "@/lib/zendesk.server";
import { mockFetch } from "@/test/http";
import { setSupabaseResult, supabaseMock } from "@/test/setup";

const TICKETS = {
  tickets: [
    {
      id: 101,
      requester_id: 55,
      created_at: "2026-05-01T10:00:00Z",
      status: "solved",
      subject: "Billing question",
      satisfaction_rating: { score: 4 },
    },
    {
      id: 102,
      requester_id: 56,
      created_at: "2026-05-04T10:00:00Z",
      status: "pending",
      subject: "Cannot log in",
    },
  ],
  users: [
    { id: 55, email: "a@acme.com", name: "Ann", organization_name: "Acme Ltd" },
    { id: 56, email: "b@acme.com", name: "Ben" },
  ],
};

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    user_id: "user-1",
    subdomain: "acme",
    access_token: "at-live",
    refresh_token: "rt-1",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    org_name: "Acme",
    last_synced_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ZENDESK_CLIENT_ID = "zd-client";
  process.env.ZENDESK_CLIENT_SECRET = "zd-secret";
});

describe("Zendesk configuration", () => {
  it("reports configured when both client credentials exist", () => {
    expect(hasZendeskCreds()).toBe(true);
    expect(getZendeskCreds()).toEqual({ clientId: "zd-client", clientSecret: "zd-secret" });
  });

  it("fails with a clear message when credentials are missing", () => {
    delete process.env.ZENDESK_CLIENT_ID;
    expect(hasZendeskCreds()).toBe(false);
    expect(() => getZendeskCreds()).toThrow(/verify the Zendesk connection configuration/i);
  });

  it("builds an authorize URL on the customer's own subdomain", () => {
    const url = new URL(buildZendeskAuthorizeUrl("acme", "https://app.test/cb", "state-123"));
    expect(url.origin).toBe("https://acme.zendesk.com");
    expect(url.pathname).toBe("/oauth/authorizations/new");
    expect(url.searchParams.get("client_id")).toBe("zd-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("read offline_access");
  });

  it("requests offline_access so Zendesk issues a refresh token", () => {
    expect(ZENDESK_SCOPE).toBe("read offline_access");
    const scopes = ZENDESK_SCOPE.split(" ");
    expect(scopes).toContain("read");
    expect(scopes).toContain("offline_access");
    expect(scopes).toHaveLength(2);
  });

  it("sends the same scope on the authorization-code exchange", async () => {
    const http = mockFetch([
      { match: "/oauth/tokens", json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
    ]);
    await exchangeZendeskCode("acme", "code-1", "https://app.test/cb");
    const body = http.requests[0].body as string;
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    expect(parsed.scope).toBe("read offline_access");
  });
});


describe("syncZendeskForUser", () => {
  it("normalizes tickets into ChAi's support dataset", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([{ match: "/api/v2/incremental/tickets.json", json: TICKETS }]);

    const [ds] = await syncZendeskForUser("user-1", 100, null);
    expect(ds.key).toBe("support");
    expect(ds.headers).toContain("zendesk_user_id");
    expect(ds.headers).toContain("company");
    const [first, second] = ds.rows;
    expect(first[0]).toBe("55");
    expect(first[1]).toBe("a@acme.com");
    expect(first[2]).toBe("Ann");
    expect(first[ds.headers.indexOf("ticket_id")]).toBe("101");
    expect(first[ds.headers.indexOf("status")]).toBe("resolved");
    expect(first[ds.headers.indexOf("satisfaction_score")]).toBe("4");
    expect(first[ds.headers.indexOf("zendesk_user_id")]).toBe("55");
    expect(second[ds.headers.indexOf("status")]).toBe("open");
  });

  it("maps provider statuses onto open / resolved", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([
      {
        match: "incremental/tickets.json",
        json: {
          tickets: [
            { id: 1, status: "closed" },
            { id: 2, status: "new" },
            { id: 3, status: "hold" },
          ],
          users: [],
        },
      },
    ]);
    const [ds] = await syncZendeskForUser("user-1", 10, null);
    const i = ds.headers.indexOf("status");
    expect(ds.rows.map((r) => r[i])).toEqual(["resolved", "open", "open"]);
  });

  it("passes the last_synced_at cursor as the incremental start_time", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    const http = mockFetch([{ match: "incremental/tickets.json", json: TICKETS }]);
    const since = "2026-05-01T00:00:00.000Z";

    await syncZendeskForUser("user-1", 100, since);

    const url = new URL(http.requests[0].url);
    expect(url.searchParams.get("start_time")).toBe(
      String(Math.floor(new Date(since).getTime() / 1000)),
    );
  });

  it("falls back to a one-year window on the first ever sync", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    const http = mockFetch([{ match: "incremental/tickets.json", json: TICKETS }]);

    await syncZendeskForUser("user-1", 100, null);

    const start = Number(new URL(http.requests[0].url).searchParams.get("start_time"));
    const yearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    expect(Math.abs(start - yearAgo)).toBeLessThan(10);
  });

  it("refreshes an expired token before fetching and persists the new one", async () => {
    setSupabaseResult("zendesk_connections", {
      data: connectionRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    });
    const http = mockFetch([
      { match: "/oauth/tokens", json: { access_token: "at-new", refresh_token: "rt-2", expires_in: 3600 } },
      { match: "incremental/tickets.json", json: TICKETS },
    ]);

    await syncZendeskForUser("user-1", 100, null);

    expect(http.requests[0].url).toContain("/oauth/tokens");
    expect(http.requests[0].method).toBe("POST");
    // The ticket call uses the refreshed token, not the stale one.
    expect(http.requests[1].headers.authorization).toBe("Bearer at-new");
    expect(supabaseMock.from).toHaveBeenCalledWith("zendesk_connections");
  });

  it("does not refresh while the token is still valid", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    const http = mockFetch([{ match: "incremental/tickets.json", json: TICKETS }]);
    await syncZendeskForUser("user-1", 100, null);
    expect(http.urls().some((u) => u.includes("/oauth/tokens"))).toBe(false);
  });

  it("surfaces a clean error when refresh fails instead of crashing", async () => {
    setSupabaseResult("zendesk_connections", {
      data: connectionRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch([{ match: "/oauth/tokens", status: 401, json: { error: "invalid_grant" } }]);

    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(/reauthorized/i);
  });

  it("explains rate limiting in plain language", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch([{ match: "incremental/tickets.json", status: 429, json: {} }]);
    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(/rate limit/i);
  });

  it("reports an API failure with its status code", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch([{ match: "incremental/tickets.json", status: 500, body: "boom" }]);
    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(
      /temporarily unavailable/i,
    );
  });

  it("tells the user to connect when there is no stored connection", async () => {
    setSupabaseResult("zendesk_connections", { data: null });
    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(/isn't connected/i);
  });

  it("returns no datasets when the provider has no new tickets", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([{ match: "incremental/tickets.json", json: { tickets: [], users: [] } }]);
    expect(await syncZendeskForUser("user-1", 100, null)).toEqual([]);
  });
});


describe("subdomain normalization", () => {
  it("accepts bare, full-host and URL forms", () => {
    expect(normalizeSubdomain("acme")).toBe("acme");
    expect(normalizeSubdomain("Acme.zendesk.com")).toBe("acme");
    expect(normalizeSubdomain("https://acme.zendesk.com/agent/dashboard")).toBe("acme");
  });

  it("rejects arbitrary or malformed input", () => {
    expect(() => normalizeSubdomain("")).toThrow(/valid Zendesk subdomain/i);
    expect(() => normalizeSubdomain("https://evil.example.com")).toThrow();
    expect(() => normalizeSubdomain("bad_subdomain!")).toThrow();
  });
});

describe("redirect URI", () => {
  it("prefers the configured production callback", () => {
    process.env.ZENDESK_REDIRECT_URI = "https://chai-retention-ai.lovable.app/api/public/zendesk/callback";
    expect(getZendeskRedirectUri("https://preview.test")).toBe(
      "https://chai-retention-ai.lovable.app/api/public/zendesk/callback",
    );
    delete process.env.ZENDESK_REDIRECT_URI;
  });

  it("falls back to the current origin in dev", () => {
    delete process.env.ZENDESK_REDIRECT_URI;
    expect(getZendeskRedirectUri("http://localhost:8080")).toBe(
      "http://localhost:8080/api/public/zendesk/callback",
    );
  });
});

describe("connection test", () => {
  it("returns the Zendesk account identity on success", async () => {
    mockFetch([
      {
        match: "/api/v2/users/me.json",
        json: { user: { id: 9, email: "admin@acme.com", organization_name: "Acme Ltd" } },
      },
    ]);
    expect(await verifyZendeskConnection("acme", "at-live")).toEqual({
      id: "9",
      email: "admin@acme.com",
      name: "Acme Ltd",
    });
  });

  it("fails loudly when the token or subdomain is wrong", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch([{ match: "/api/v2/users/me.json", status: 404, body: "not found" }]);
    await expect(verifyZendeskConnection("acme", "at-live")).rejects.toThrow(/verify the Zendesk subdomain/i);
  });
});
