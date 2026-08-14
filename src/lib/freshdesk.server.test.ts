// Tier 3 — Freshdesk: API-key auth, numeric status mapping, contact/CSAT
// enrichment, and incremental window.
import { describe, it, expect, vi } from "vitest";
import { syncFreshdeskForUser } from "@/lib/freshdesk.server";
import { mockFetch } from "@/test/http";
import { setSupabaseResult } from "@/test/setup";

// The stored API key is encrypted at rest; the crypto helper needs a server
// secret we don't want in tests, so stub it with a pass-through.
vi.mock("@/lib/connection-key-crypto.server", () => ({
  encryptConnectionKey: (v: string) => `enc:${v}`,
  decryptConnectionKey: (v: string) => v.replace(/^enc:/, ""),
}));

const CONN = {
  id: "f1",
  user_id: "user-1",
  domain: "acme",
  api_key_ciphertext: "enc:key-123",
  last_synced_at: null,
};

const TICKETS = [
  {
    id: 11,
    requester_id: 501,
    created_at: "2026-04-02T09:00:00Z",
    status: 5,
    subject: "Invoice mismatch",
  },
  {
    id: 12,
    requester_id: 502,
    created_at: "2026-04-06T09:00:00Z",
    status: 3,
    subject: "Onboarding question",
  },
];

function routes(extra: { csatOk?: boolean } = {}) {
  return [
    { match: "/api/v2/tickets", json: TICKETS },
    { match: "/api/v2/contacts/501", json: { id: 501, email: "a@acme.com" } },
    { match: "/api/v2/contacts/502", json: { id: 502, email: "b@acme.com" } },
    {
      match: "/satisfaction_ratings",
      status: extra.csatOk === false ? 403 : 200,
      json: [{ ticket_id: 11, ratings: { default_question: 103 } }],
    },
  ];
}

describe("syncFreshdeskForUser", () => {
  it("normalizes tickets, resolving requester emails and CSAT", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    mockFetch(routes());

    const [ds] = await syncFreshdeskForUser("user-1", 100, null);
    expect(ds.key).toBe("support");
    expect(ds.rows).toEqual([
      ["501", "a@acme.com", "", "11", "2026-04-02", "resolved", "Invoice mismatch", "103"],
      ["502", "b@acme.com", "", "12", "2026-04-06", "open", "Onboarding question", ""],
    ]);
  });

  it("authenticates with the API key over HTTP basic on the user's domain", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    const http = mockFetch(routes());

    await syncFreshdeskForUser("user-1", 100, null);

    const req = http.find("/api/v2/tickets")!;
    expect(req.url).toContain("https://acme.freshdesk.com");
    const decoded = Buffer.from(req.headers.authorization.replace("Basic ", ""), "base64").toString();
    expect(decoded).toBe("key-123:X");
  });

  it("requests only tickets updated since the last sync", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    const http = mockFetch(routes());
    const since = "2026-04-01T00:00:00.000Z";

    await syncFreshdeskForUser("user-1", 100, since);

    const url = new URL(http.find("/api/v2/tickets")!.url);
    expect(url.searchParams.get("updated_since")).toBe(since);
    expect(url.searchParams.get("order_by")).toBe("updated_at");
  });

  it("still imports tickets when the account has no CSAT surveys", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    mockFetch(routes({ csatOk: false }));

    const [ds] = await syncFreshdeskForUser("user-1", 100, null);
    expect(ds.rows.map((r) => r[7])).toEqual(["", ""]);
  });

  it("falls back to the requester id when a contact lookup fails", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    mockFetch([
      { match: "/api/v2/tickets", json: [TICKETS[0]] },
      { match: "/api/v2/contacts/501", status: 404, json: {} },
      { match: "/satisfaction_ratings", json: [] },
    ]);

    const [ds] = await syncFreshdeskForUser("user-1", 100, null);
    expect(ds.rows[0][0]).toBe("501");
  });

  it("explains rate limiting in plain language", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    mockFetch([{ match: "/api/v2/tickets", status: 429, json: {} }]);
    await expect(syncFreshdeskForUser("user-1", 100, null)).rejects.toThrow(/rate limit/i);
  });

  it("asks the user to connect when no Freshdesk account is linked", async () => {
    setSupabaseResult("freshdesk_connections", { data: null });
    await expect(syncFreshdeskForUser("user-1", 100, null)).rejects.toThrow(/isn't connected/i);
  });

  it("returns nothing when there are no new tickets", async () => {
    setSupabaseResult("freshdesk_connections", { data: CONN });
    mockFetch([{ match: "/api/v2/tickets", json: [] }]);
    expect(await syncFreshdeskForUser("user-1", 100, null)).toEqual([]);
  });
});
