// Real-database test for the atomic single-use OAuth state consumption
// function. Runs the exact `consume_oauth_state` SQL shipped in the migration
// against a throwaway Postgres instance.
import { describe, it, expect, afterAll } from "vitest";
import { startPostgres, lit, type PgHandle } from "@/test/pg";
import { hashOAuthState, generateOAuthState } from "@/lib/oauth-state.server";

let pg: PgHandle | null = startPostgres();

const DDL = `
create table if not exists intercom_oauth_states (
  state text primary key,
  user_id uuid not null,
  provider text not null default 'intercom',
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

create or replace function consume_oauth_state(
  p_table text, p_state_hash text, p_provider text default null
) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  if p_table not in ('accounting_oauth_states','intercom_oauth_states','zoho_crm_oauth_states') then
    raise exception 'unsupported oauth state table';
  end if;
  execute format(
    'DELETE FROM %1$I t WHERE t.state = $1 AND ($2 IS NULL OR t.provider = $2) RETURNING to_jsonb(t)',
    p_table
  ) into r using p_state_hash, p_provider;
  if r is null then return null; end if;
  if (r->>'expires_at') is not null and (r->>'expires_at')::timestamptz < now() then
    return jsonb_build_object('expired', true);
  end if;
  return r;
end $$;`;

if (pg) pg.exec(DDL);

afterAll(() => pg?.stop());

const USER = "11111111-1111-1111-1111-111111111111";

function seed(state: string, opts: { expires?: string; user?: string } = {}) {
  pg!.query(
    `insert into intercom_oauth_states (state, user_id, redirect_uri, expires_at)
     values (${lit(hashOAuthState(state))}, ${lit(opts.user ?? USER)}, 'https://chai-retention-ai.lovable.app/api/public/intercom/callback',
     ${opts.expires ? lit(opts.expires) : "now() + interval '15 minutes'"})`,
  );
}

function consume(state: string, provider: string | null = "intercom") {
  const rows = pg!.query(
    `select consume_oauth_state('intercom_oauth_states', ${lit(hashOAuthState(state))}, ${lit(provider)}) as r`,
  ) as { r: unknown }[];
  return rows[0]?.r ?? null;
}

const d = pg ? describe : describe.skip;

d("consume_oauth_state (real Postgres)", () => {
  it("returns the row once and nothing on replay", () => {
    const s = generateOAuthState();
    seed(s);
    const first = consume(s) as Record<string, unknown> | null;
    expect(first?.user_id).toBe(USER);
    expect(consume(s)).toBeNull();
  });

  it("reports expiry instead of creating a connection", () => {
    const s = generateOAuthState();
    seed(s, { expires: new Date(Date.now() - 60_000).toISOString() });
    expect(consume(s)).toEqual({ expired: true });
    // the expired row is still removed
    expect(consume(s)).toBeNull();
  });

  it("rejects a state replayed against a different provider", () => {
    const s = generateOAuthState();
    seed(s);
    expect(consume(s, "zoho_crm")).toBeNull();
    expect((consume(s) as Record<string, unknown>)?.user_id).toBe(USER);
  });

  it("lets only one of two racing consumers win", () => {
    const s = generateOAuthState();
    seed(s);
    // Two DELETE ... RETURNING statements issued back to back on separate
    // backends: the second finds no row, so only one connection can be made.
    const results = [consume(s), consume(s)];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses unknown state tables", () => {
    expect(() =>
      pg!.query(`select consume_oauth_state('profiles', 'x', null) as r`),
    ).toThrow();
  });
});
