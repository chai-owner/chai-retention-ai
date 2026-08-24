// Tier 3 — Intercom: authorize URL, conversation normalization, incremental
// window, region resolution, and error surfacing.
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildIntercomAuthorizeUrl,
  getIntercomCreds,
  hasIntercomCreds,
  syncIntercomForUser,
  detectIntercomRegion,
  resolveIntercomHost,
  isAllowedIntercomHost,
} from "@/lib/intercom.server";
import { mockFetch } from "@/test/http";
import { setSupabaseResult } from "@/test/setup";

const CONN = {
  id: "c1",
  user_id: "user-1",
  access_token: "at-intercom",
  workspace_name: "Acme",
  workspace_id: "ws1",
  region: "us",
  api_host: "api.intercom.io",
  last_synced_at: null,
};


const CONVOS = {
  conversations: [
    {
      id: 900,
      created_at: 1767225600, // 2026-01-01
      state: "closed",
      source: { subject: "Renewal help", author: { email: "a@acme.com" } },
      conversation_rating: { rating: 5 },
    },
    {
      id: 901,
      created_at: 1767312000,
      state: "snoozed",
      source: { subject: "Feature request", author: { id: "u2" } },
      contacts: { contacts: [{ id: "ct2", external_id: "CUST-2" }] },
    },
  ],
};

beforeEach(() => {
  process.env.INTERCOM_CLIENT_ID = "ic-client";
  process.env.INTERCOM_CLIENT_SECRET = "ic-secret";
});

describe("Intercom configuration", () => {
  it("reports configured when credentials exist", () => {
    expect(hasIntercomCreds()).toBe(true);
    expect(getIntercomCreds().clientId).toBe("ic-client");
  });

  it("explains what is missing when unconfigured", () => {
    delete process.env.INTERCOM_CLIENT_SECRET;
    expect(hasIntercomCreds()).toBe(false);
    expect(() => buildIntercomAuthorizeUrl("s")).toThrow(/INTERCOM_CLIENT_ID/);
  });

  it("builds an authorize URL carrying the CSRF state", () => {
    const url = new URL(buildIntercomAuthorizeUrl("state-9"));
    expect(url.origin + url.pathname).toBe("https://app.intercom.com/oauth");
    expect(url.searchParams.get("client_id")).toBe("ic-client");
    expect(url.searchParams.get("state")).toBe("state-9");
  });
});

describe("syncIntercomForUser", () => {
  it("normalizes conversations into the support dataset", async () => {
    setSupabaseResult("intercom_connections", { data: CONN });
    mockFetch([{ match: "/conversations/search", json: CONVOS }]);

    const [ds] = await syncIntercomForUser("user-1", 100, null);
    expect(ds.key).toBe("support");
    expect(ds.rows[0]).toEqual([
      "a@acme.com", "a@acme.com", "", "900", "2026-01-01", "resolved", "Renewal help", "5",
    ]);
    // No email → the contact's external id carries the identity, and snoozed reads as open.
    expect(ds.rows[1]).toEqual([
      "CUST-2", "", "", "901", "2026-01-02", "open", "Feature request", "",
    ]);
  });

  it("queries only conversations updated since the last sync", async () => {
    setSupabaseResult("intercom_connections", { data: CONN });
    const http = mockFetch([{ match: "/conversations/search", json: CONVOS }]);
    const since = "2026-05-01T00:00:00.000Z";

    await syncIntercomForUser("user-1", 100, since);

    const body = JSON.parse(http.requests[0].body!);
    expect(body.query).toEqual({
      field: "updated_at",
      operator: ">",
      value: Math.floor(new Date(since).getTime() / 1000),
    });
    expect(http.requests[0].headers.authorization).toBe("Bearer at-intercom");
  });

  it("caps the number of rows at the requested limit", async () => {
    setSupabaseResult("intercom_connections", { data: CONN });
    mockFetch([{ match: "/conversations/search", json: CONVOS }]);
    const [ds] = await syncIntercomForUser("user-1", 1, null);
    expect(ds.rows).toHaveLength(1);
  });

  it("returns nothing when there are no new conversations", async () => {
    setSupabaseResult("intercom_connections", { data: CONN });
    mockFetch([{ match: "/conversations/search", json: { conversations: [] } }]);
    expect(await syncIntercomForUser("user-1", 100, null)).toEqual([]);
  });

  it("explains rate limiting in plain language", async () => {
    setSupabaseResult("intercom_connections", { data: CONN });
    mockFetch([{ match: "/conversations/search", status: 429, json: {} }]);
    await expect(syncIntercomForUser("user-1", 100, null)).rejects.toThrow(/rate limit/i);
  });

  it("asks the user to connect when no workspace is linked", async () => {
    setSupabaseResult("intercom_connections", { data: null });
    await expect(syncIntercomForUser("user-1", 100, null)).rejects.toThrow(/isn't connected/i);
  });
});

describe("Intercom regions", () => {
  it("allowlists only Intercom's three regional API hosts", () => {
    expect(isAllowedIntercomHost("api.intercom.io")).toBe(true);
    expect(isAllowedIntercomHost("api.eu.intercom.io")).toBe(true);
    expect(isAllowedIntercomHost("api.au.intercom.io")).toBe(true);
    expect(isAllowedIntercomHost("api.intercom.io.evil.com")).toBe(false);
    expect(isAllowedIntercomHost("attacker.example")).toBe(false);
    expect(isAllowedIntercomHost(null)).toBe(false);
  });

  it("maps regions to hosts and falls back to US for legacy rows", () => {
    expect(resolveIntercomHost("eu")).toEqual({ region: "eu", apiHost: "api.eu.intercom.io" });
    expect(resolveIntercomHost("AU")).toEqual({ region: "au", apiHost: "api.au.intercom.io" });
    expect(resolveIntercomHost(null)).toEqual({ region: "us", apiHost: "api.intercom.io" });
    // An untrusted host is ignored; the validated region wins.
    expect(resolveIntercomHost("eu", "api.evil.example")).toEqual({
      region: "eu",
      apiHost: "api.eu.intercom.io",
    });
  });

  it("detects a US workspace from the primary host", async () => {
    mockFetch([{ match: "https://api.intercom.io/me", json: { app: { id_code: "us1", name: "US Co" } } }]);
    const id = await detectIntercomRegion("tok");
    expect(id.region).toBe("us");
    expect(id.apiHost).toBe("api.intercom.io");
    expect(id.workspaceName).toBe("US Co");
  });

  it("detects an EU workspace when only the EU host accepts the token", async () => {
    const http = mockFetch([
      { match: "https://api.intercom.io/me", status: 401, json: {} },
      { match: "https://api.eu.intercom.io/me", json: { app: { id_code: "eu1", name: "EU Co" } } },
    ]);
    const id = await detectIntercomRegion("tok");
    expect(id.region).toBe("eu");
    expect(id.apiHost).toBe("api.eu.intercom.io");
    expect(http.urls()).toContain("https://api.eu.intercom.io/me");
  });

  it("detects an Australian workspace", async () => {
    mockFetch([
      { match: "https://api.intercom.io/me", status: 401, json: {} },
      { match: "https://api.eu.intercom.io/me", status: 401, json: {} },
      { match: "https://api.au.intercom.io/me", json: { app: { id_code: "au1", name: "AU Co" } } },
    ]);
    const id = await detectIntercomRegion("tok");
    expect(id.region).toBe("au");
    expect(id.apiHost).toBe("api.au.intercom.io");
  });

  it("honours Intercom's own region hint when it is allowlisted", async () => {
    mockFetch([
      { match: "https://api.intercom.io/me", json: { app: { id_code: "x", name: "X", region: "AU" } } },
    ]);
    expect((await detectIntercomRegion("tok")).apiHost).toBe("api.au.intercom.io");
  });

  it("ignores an untrusted region hint and keeps the responding host", async () => {
    mockFetch([
      {
        match: "https://api.intercom.io/me",
        json: { app: { id_code: "x", name: "X", region: "evil.example" } },
      },
    ]);
    expect((await detectIntercomRegion("tok")).apiHost).toBe("api.intercom.io");
  });

  it("explains when no region accepts the token", async () => {
    mockFetch([{ match: "/me", status: 401, json: {} }]);
    await expect(detectIntercomRegion("tok")).rejects.toThrow(/couldn't confirm which Intercom region/i);
  });

  it("syncs an EU connection against the EU host", async () => {
    setSupabaseResult("intercom_connections", {
      data: { ...CONN, region: "eu", api_host: "api.eu.intercom.io" },
    });
    const http = mockFetch([
      { match: "https://api.eu.intercom.io/conversations/search", json: CONVOS },
    ]);
    const [ds] = await syncIntercomForUser("user-1", 100, null);
    expect(ds.rows).toHaveLength(2);
    expect(http.urls()[0]).toBe("https://api.eu.intercom.io/conversations/search");
  });

  it("syncs an Australian connection against the AU host", async () => {
    setSupabaseResult("intercom_connections", {
      data: { ...CONN, region: "au", api_host: "api.au.intercom.io" },
    });
    const http = mockFetch([
      { match: "https://api.au.intercom.io/conversations/search", json: CONVOS },
    ]);
    await syncIntercomForUser("user-1", 100, null);
    expect(http.urls()[0]).toBe("https://api.au.intercom.io/conversations/search");
  });

  it("keeps legacy connections (no region stored) on the US host", async () => {
    setSupabaseResult("intercom_connections", { data: { ...CONN, region: null, api_host: null } });
    const http = mockFetch([{ match: "https://api.intercom.io/conversations/search", json: CONVOS }]);
    await syncIntercomForUser("user-1", 100, null);
    expect(http.urls()[0]).toBe("https://api.intercom.io/conversations/search");
  });

  it("never calls a spoofed host stored on the connection row", async () => {
    setSupabaseResult("intercom_connections", {
      data: { ...CONN, region: "us", api_host: "api.intercom.io.attacker.example" },
    });
    const http = mockFetch([{ match: "https://api.intercom.io/conversations/search", json: CONVOS }]);
    await syncIntercomForUser("user-1", 100, null);
    expect(http.urls()[0]).toBe("https://api.intercom.io/conversations/search");
  });
});
