// Tier 3 — Zendesk: normalization, incremental cursor, token refresh, errors.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildZendeskAuthorizeUrl,
  getZendeskCreds,
  hasZendeskCreds,
  syncZendeskForUser,
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
    { id: 55, email: "a@acme.com" },
    { id: 56, email: "b@acme.com" },
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
    expect(() => getZendeskCreds()).toThrow(/ZENDESK_CLIENT_ID/);
  });

  it("builds an authorize URL on the customer's own subdomain", () => {
    const url = new URL(buildZendeskAuthorizeUrl("acme", "https://app.test/cb", "state-123"));
    expect(url.origin).toBe("https://acme.zendesk.com");
    expect(url.pathname).toBe("/oauth/authorizations/new");
    expect(url.searchParams.get("client_id")).toBe("zd-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("syncZendeskForUser", () => {
  it("normalizes tickets into ChAi's support dataset", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([{ match: "/api/v2/incremental/tickets.json", json: TICKETS }]);

    const [ds] = await syncZendeskForUser("user-1", 100, null);
    expect(ds.key).toBe("support");
    expect(ds.headers).toEqual([
      "customer_id",
      "ticket_id",
      "created_date",
      "status",
      "category",
      "satisfaction_score",
    ]);
    expect(ds.rows).toEqual([
      ["a@acme.com", "101", "2026-05-01", "resolved", "Billing question", "4"],
      ["b@acme.com", "102", "2026-05-04", "open", "Cannot log in", ""],
    ]);
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
    expect(ds.rows.map((r) => r[3])).toEqual(["resolved", "open", "open"]);
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

    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(
      /Zendesk token refresh failed \[401\]/,
    );
  });

  it("explains rate limiting in plain language", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([{ match: "incremental/tickets.json", status: 429, json: {} }]);
    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(/rate limit/i);
  });

  it("reports an API failure with its status code", async () => {
    setSupabaseResult("zendesk_connections", { data: connectionRow() });
    mockFetch([{ match: "incremental/tickets.json", status: 500, body: "boom" }]);
    await expect(syncZendeskForUser("user-1", 100, null)).rejects.toThrow(/\[500\]/);
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
