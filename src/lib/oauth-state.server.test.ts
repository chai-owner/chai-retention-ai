// Phase 2 OAuth hardening: state randomness, hashing, expiry, single-use,
// tenant/user binding, wrong-provider rejection and redirect-URI safety.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateOAuthState,
  hashOAuthState,
  createOAuthState,
  consumeOAuthState,
  resolveRedirectUri,
  safeAppOrigin,
  isAllowedOrigin,
  sanitizeOAuthError,
  OAUTH_STATE_TTL_MS,
  PRODUCTION_ORIGIN,
} from "@/lib/oauth-state.server";

// --- A tiny in-memory stand-in for the state tables + the atomic RPC --------
interface Row {
  state: string;
  user_id: string;
  provider: string;
  redirect_uri: string;
  expires_at: string;
  [k: string]: unknown;
}

function makeDb() {
  const tables = new Map<string, Row[]>();
  const rows = (t: string) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t)!;
  };
  const db = {
    tables,
    from: (t: string) => ({
      insert: async (row: Row) => {
        rows(t).push(row);
        return { error: null };
      },
      delete: () => ({
        lt: async () => ({ error: null }),
      }),
    }),
    // DELETE ... RETURNING semantics: the first caller removes the row, any
    // concurrent caller finds nothing.
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      const table = args.p_table as string;
      const list = rows(table);
      const idx = list.findIndex(
        (r) =>
          r.state === args.p_state_hash &&
          (args.p_provider == null || r.provider === args.p_provider),
      );
      if (idx === -1) return { data: null, error: null };
      const [row] = list.splice(idx, 1);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { data: { expired: true }, error: null };
      }
      return { data: row, error: null };
    },
  };
  return db;
}

describe("oauth state generation", () => {
  it("produces unpredictable, unique, high-entropy values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const s = generateOAuthState();
      expect(s.length).toBeGreaterThanOrEqual(40);
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });

  it("stores only a hash of the state server-side", async () => {
    const db = makeDb();
    const state = await createOAuthState(db as never, {
      table: "intercom_oauth_states",
      userId: "user-a",
      provider: "intercom",
      redirectUri: `${PRODUCTION_ORIGIN}/api/public/intercom/callback`,
    });
    const stored = db.tables.get("intercom_oauth_states")![0];
    expect(stored.state).toBe(hashOAuthState(state));
    expect(stored.state).not.toBe(state);
    expect(stored.user_id).toBe("user-a");
    const ttl = new Date(stored.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(OAUTH_STATE_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(OAUTH_STATE_TTL_MS);
  });
});

describe("oauth state consumption", () => {
  let db: ReturnType<typeof makeDb>;
  beforeEach(() => {
    db = makeDb();
  });

  async function seed(overrides: Partial<Row> = {}) {
    const state = await createOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      userId: "user-a",
      provider: "zoho_crm",
      redirectUri: `${PRODUCTION_ORIGIN}/api/public/zoho/callback`,
      extra: { dc: "com" },
    });
    Object.assign(db.tables.get("zoho_crm_oauth_states")![0], overrides);
    return state;
  }

  it("accepts a valid state once and binds it to the issuing user", async () => {
    const state = await seed();
    const first = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state,
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.row.user_id).toBe("user-a");
  });

  it("rejects a replayed state (single-use)", async () => {
    const state = await seed();
    await consumeOAuthState(db as never, { table: "zoho_crm_oauth_states", provider: "zoho_crm", state });
    const second = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state,
    });
    expect(second).toEqual({ ok: false, reason: "invalid_or_reused_state" });
  });

  it("rejects an expired state", async () => {
    const state = await seed({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const out = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state,
    });
    expect(out).toEqual({ ok: false, reason: "expired_state" });
  });

  it("rejects an unknown / attacker-guessed state", async () => {
    await seed();
    const out = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state: generateOAuthState(),
    });
    expect(out.ok).toBe(false);
  });

  it("rejects a state issued for another provider", async () => {
    const state = await seed();
    const out = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "intercom",
      state,
    });
    expect(out.ok).toBe(false);
    // and the row is untouched, so the legitimate flow still works
    const good = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state,
    });
    expect(good.ok).toBe(true);
  });

  it("never lets a second user/tenant own the connection", async () => {
    // Organisation A starts the flow; the callback recovers A's user id from
    // trusted server-side state, regardless of anything the browser supplies.
    const state = await seed({ user_id: "org-a-user" });
    const out = await consumeOAuthState(db as never, {
      table: "zoho_crm_oauth_states",
      provider: "zoho_crm",
      state,
    });
    expect(out.ok && out.row.user_id).toBe("org-a-user");
  });

  it("only one of two simultaneous callbacks wins", async () => {
    const state = await seed();
    const [a, b] = await Promise.all([
      consumeOAuthState(db as never, { table: "zoho_crm_oauth_states", provider: "zoho_crm", state }),
      consumeOAuthState(db as never, { table: "zoho_crm_oauth_states", provider: "zoho_crm", state }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe("redirect uri security", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.ACCOUNTING_REDIRECT_URI;
    delete process.env.OAUTH_ALLOWED_ORIGINS;
  });

  it("always prefers the configured fixed production redirect URI", () => {
    process.env.ACCOUNTING_REDIRECT_URI = `${PRODUCTION_ORIGIN}/api/public/accounting/callback`;
    const uri = resolveRedirectUri(
      "ACCOUNTING_REDIRECT_URI",
      "/api/public/accounting/callback",
      "https://evil.example.com",
    );
    expect(uri).toBe(`${PRODUCTION_ORIGIN}/api/public/accounting/callback`);
  });

  it("refuses arbitrary browser-supplied origins", () => {
    expect(() =>
      resolveRedirectUri("ACCOUNTING_REDIRECT_URI", "/api/public/accounting/callback", "https://evil.example.com"),
    ).toThrow();
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("allows explicitly configured development origins", () => {
    process.env.OAUTH_ALLOWED_ORIGINS = "https://dev.chai.test";
    expect(
      resolveRedirectUri("ACCOUNTING_REDIRECT_URI", "/api/public/accounting/callback", "https://dev.chai.test/"),
    ).toBe("https://dev.chai.test/api/public/accounting/callback");
  });

  it("falls back to production for post-OAuth redirects from unknown origins", () => {
    expect(safeAppOrigin("https://attacker.test")).toBe(PRODUCTION_ORIGIN);
    expect(safeAppOrigin(PRODUCTION_ORIGIN)).toBe(PRODUCTION_ORIGIN);
  });
});

describe("oauth error sanitisation", () => {
  it("redacts codes, tokens and secrets from provider errors", () => {
    const dirty =
      'token failed code=AUTHCODE123&client_secret=shhh {"access_token":"abc","refresh_token":"def"}';
    const clean = sanitizeOAuthError(dirty);
    expect(clean).not.toContain("AUTHCODE123");
    expect(clean).not.toContain("shhh");
    expect(clean).not.toContain("abc");
    expect(clean).not.toContain("def");
    expect(clean).toContain("[redacted]");
  });

  it("caps the length so provider internals are not dumped to users", () => {
    expect(sanitizeOAuthError("x".repeat(1000)).length).toBeLessThanOrEqual(160);
  });
});

describe("hashing", () => {
  it("is deterministic and one-way sized", () => {
    const s = generateOAuthState();
    expect(hashOAuthState(s)).toBe(hashOAuthState(s));
    expect(hashOAuthState(s)).toHaveLength(64);
    expect(hashOAuthState(s)).not.toBe(hashOAuthState(generateOAuthState()));
  });
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
