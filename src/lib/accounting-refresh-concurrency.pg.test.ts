// Real-database concurrency test for the accounting refresh lock.
//
// Two genuinely concurrent requests (separate Postgres backends via psql) race
// to refresh the same expired connection. The conditional UPDATE must let
// exactly one of them rotate the refresh token; the other must poll the row and
// adopt the winner's freshly stored access token.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { refreshWithLock, type ConnectionRow } from "@/lib/accounting.server";
import { encryptSecret, decryptSecret } from "@/lib/connection-key-crypto.server";
import { startPostgres, pgSupabase, lit, type PgHandle } from "@/test/pg";
import { supabaseMock } from "@/test/setup";

const USER = "11111111-1111-1111-1111-111111111111";
const PROVIDER = "quickbooks" as const;
const CONN_ID = "22222222-2222-2222-2222-222222222222";

// Booted at module scope: `it`/`describe` selection happens during collection,
// before beforeAll would have run.
let pg: PgHandle | null = null;
let originalFrom: typeof supabaseMock.from;

const DDL = `
create table if not exists accounting_connections (
  id uuid primary key,
  user_id uuid not null,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  refresh_lock_at timestamptz,
  status text not null default 'connected',
  last_error_at timestamptz,
  last_error_message text,
  realm_id text,
  tenant_id text,
  account_id text,
  company_name text,
  tenants jsonb not null default '[]'::jsonb,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);`;

process.env.QUICKBOOKS_CLIENT_ID ??= "test-client";
process.env.QUICKBOOKS_CLIENT_SECRET ??= "test-secret";
pg = startPostgres();
if (pg) pg.query(DDL);

beforeAll(() => {
  if (!pg) console.warn("Postgres unavailable — concurrency test skipped.");
});

afterAll(() => {
  pg?.stop();
});

function seedExpiredConnection() {
  const expired = new Date(Date.now() - 60_000).toISOString();
  pg!.query(`delete from accounting_connections where id = ${lit(CONN_ID)}`);
  pg!.query(`insert into accounting_connections
    (id, user_id, provider, access_token, refresh_token, expires_at, status, realm_id)
    values (${lit(CONN_ID)}, ${lit(USER)}, ${lit(PROVIDER)},
      ${lit(encryptSecret("old-access"))}, ${lit(encryptSecret("old-refresh"))},
      ${lit(expired)}, 'connected', ${lit("realm-1")})`);
}

function readRow(): Record<string, unknown> {
  return pg!.query(
    `select * from accounting_connections where id = ${lit(CONN_ID)}`,
  )[0] as Record<string, unknown>;
}

function currentRow(): ConnectionRow {
  const r = readRow();
  return {
    ...r,
    access_token: decryptSecret(String(r.access_token)),
    refresh_token: r.refresh_token ? decryptSecret(String(r.refresh_token)) : null,
  } as unknown as ConnectionRow;
}

describe("accounting refresh lock (real Postgres)", () => {
  beforeEach(() => {
    if (!pg) return;
    originalFrom = supabaseMock.from;
    supabaseMock.from = pgSupabase(pg).from as unknown as typeof supabaseMock.from;
  });

  afterAll(() => {
    if (originalFrom) supabaseMock.from = originalFrom;
  });

  (pg ? it : it.skip)(
    "lets exactly one concurrent request rotate the refresh token",
    async () => {
      seedExpiredConnection();

      // Provider stub: slow (600ms) refresh, rotating refresh token, and it
      // rejects any reuse of the consumed refresh token the way a real
      // provider would.
      const tokenCalls: string[] = [];
      let rotated = false;
      globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const body = String(init?.body ?? "");
        const sent = new URLSearchParams(body).get("refresh_token") ?? "";
        tokenCalls.push(sent);
        await new Promise((r) => setTimeout(r, 600));
        if (sent !== "old-refresh" || rotated) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        rotated = true;
        return new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            x_refresh_token_expires_in: 8_726_400,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;

      const opts = { pollIntervalMs: 50, maxWaitMs: 10_000 };
      const [a, b] = await Promise.all([
        refreshWithLock(USER, PROVIDER, currentRow(), opts),
        refreshWithLock(USER, PROVIDER, currentRow(), opts),
      ]);

      // Exactly one provider refresh happened, with the original token.
      expect(tokenCalls).toEqual(["old-refresh"]);

      // Both requests ended up with the rotated access token.
      expect(a.access_token).toBe("new-access");
      expect(b.access_token).toBe("new-access");

      const stored = readRow();
      expect(decryptSecret(String(stored.access_token))).toBe("new-access");
      expect(decryptSecret(String(stored.refresh_token))).toBe("new-refresh");
      expect(stored.status).toBe("connected");
      expect(stored.refresh_lock_at).toBeNull();
      expect(stored.refresh_token_expires_at).toBeTruthy();
    },
    30_000,
  );

  (pg ? it : it.skip)("recovers a connection whose lock was abandoned", async () => {
    seedExpiredConnection();
    // A crashed process left a lock behind, older than the 30s TTL.
    const stale = new Date(Date.now() - 60_000).toISOString();
    pg!.query(
      `update accounting_connections set refresh_lock_at = ${lit(stale)} where id = ${lit(CONN_ID)}`,
    );

    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ access_token: "recovered", refresh_token: "r2", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const row = await refreshWithLock(USER, PROVIDER, currentRow(), {
      pollIntervalMs: 25,
      maxWaitMs: 2_000,
    });
    expect(calls).toBe(1);
    expect(row.access_token).toBe("recovered");
    expect(readRow().refresh_lock_at).toBeNull();
  });
});
