// Shared OAuth CSRF-state handling for the interactive "Connect X" flows,
// ported from src/lib/oauth-state.server.ts (Phase 2 security model):
//  - state is 32 bytes of CSPRNG output, generated and stored server-side
//  - only the SHA-256 hash of the state is persisted; the raw value never
//    leaves the browser round-trip
//  - state rows carry the authenticated user, the provider, the redirect URI
//    and a short expiry (15 minutes)
//  - consumption is a single atomic `DELETE ... RETURNING` inside the
//    `consume_oauth_state` database function, so two concurrent callbacks can
//    never both win
//
// Zendesk keeps its own hardened implementation (see zendesk.ts) and is NOT
// routed through this module, matching the app's existing design.
import { createHash, randomBytes } from "node:crypto";

export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export type OAuthStateTable =
  | "accounting_oauth_states"
  | "intercom_oauth_states"
  | "zoho_crm_oauth_states";

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

// deno-lint-ignore no-explicit-any
type Db = any;

export interface CreateStateArgs {
  table: OAuthStateTable;
  userId: string;
  provider: string;
  redirectUri: string;
  /** Extra provider columns, e.g. { dc: "eu" }. */
  extra?: Record<string, unknown>;
}

/** Inserts a state row and returns the raw state value for the authorize URL. */
export async function createOAuthState(db: Db, args: CreateStateArgs): Promise<string> {
  const state = generateOAuthState();
  const now = Date.now();
  const row = {
    state: hashOAuthState(state),
    user_id: args.userId,
    provider: args.provider,
    redirect_uri: args.redirectUri,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + OAUTH_STATE_TTL_MS).toISOString(),
    ...(args.extra ?? {}),
  };
  const { error } = await db.from(args.table).insert(row);
  if (error) throw new Error((error as { message: string }).message);

  // Opportunistic cleanup of abandoned attempts. Never fatal.
  try {
    await db.from(args.table).delete().lt("expires_at", new Date(now).toISOString());
  } catch {
    /* ignore */
  }
  return state;
}

export type ConsumeOutcome =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: "invalid_or_reused_state" | "expired_state" };

/**
 * Atomically consumes a state value via the `consume_oauth_state` Postgres
 * function (a single `DELETE ... RETURNING`), so a second/concurrent callback
 * with the same state always loses.
 */
export async function consumeOAuthState(
  db: Db,
  args: { table: OAuthStateTable; provider: string | null; state: string },
): Promise<ConsumeOutcome> {
  const { data, error } = await db.rpc("consume_oauth_state", {
    p_table: args.table,
    p_state_hash: hashOAuthState(args.state),
    p_provider: args.provider ?? null,
  });
  if (error) throw new Error((error as { message: string }).message);
  if (!data) return { ok: false, reason: "invalid_or_reused_state" };
  const row = data as Record<string, unknown>;
  if (row.expired === true) return { ok: false, reason: "expired_state" };
  return { ok: true, row };
}

/**
 * Scrubs provider error payloads before they reach logs: authorization codes,
 * tokens and secrets must never be echoed.
 */
export function sanitizeOAuthError(message: string): string {
  return message
    .replace(/(code|access_token|refresh_token|client_secret|id_token)=[^&\s"']+/gi, "$1=[redacted]")
    .replace(/"(access_token|refresh_token|client_secret|code)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .slice(0, 160);
}
