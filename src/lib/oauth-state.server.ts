// Shared, server-only OAuth state handling for ChAi's per-user integrations.
//
// Security properties (Phase 2):
//  - state is 32 bytes of CSPRNG output, generated and stored server-side
//  - only the SHA-256 hash of the state is persisted; the raw value never
//    leaves the browser round-trip
//  - state rows carry the authenticated user, the provider, the redirect URI
//    and a short expiry (15 minutes)
//  - consumption is a single atomic `DELETE ... RETURNING` inside a database
//    function, so two concurrent callbacks can never both win
//  - redirect URIs are fixed/allowlisted, never derived from arbitrary
//    browser-supplied origins
//
// Zendesk deliberately keeps its own hardened implementation and is NOT routed
// through this module.
import { createHash, randomBytes } from "node:crypto";

export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export type OAuthStateTable =
  | "accounting_oauth_states"
  | "intercom_oauth_states"
  | "zoho_crm_oauth_states";

/** Cryptographically random, URL-safe state value handed to the provider. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is persisted, so a leaked state table cannot be replayed. */
export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Redirect URI security
// ---------------------------------------------------------------------------

/** Fixed production origin for ChAi. */
export const PRODUCTION_ORIGIN = "https://chai-retention-ai.lovable.app";

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Deliberate, explicit allowlist. Preview/development origins must be listed
 * (via OAUTH_ALLOWED_ORIGINS) — arbitrary browser-supplied origins are never
 * accepted.
 */
export function allowedOrigins(): string[] {
  const configured = (process.env.OAUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  return Array.from(
    new Set([
      PRODUCTION_ORIGIN,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      ...configured,
    ]),
  );
}

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().includes(normalizeOrigin(origin));
}

/**
 * Resolves the redirect URI sent to the provider.
 *
 * A configured value (e.g. ACCOUNTING_REDIRECT_URI) always wins so production
 * uses the exact URI registered in the provider's dashboard. Otherwise the
 * caller's origin is used only when it is explicitly allowlisted.
 */
export function resolveRedirectUri(
  envVar: string,
  callbackPath: string,
  originFallback: string,
): string {
  const configured = process.env[envVar]?.trim();
  if (configured) return normalizeOrigin(configured);
  const origin = normalizeOrigin(originFallback);
  if (!isAllowedOrigin(origin)) {
    throw new Error(
      "This environment isn't allowed to start an OAuth connection. " +
        "Please connect from the production app.",
    );
  }
  return `${origin}${callbackPath}`;
}

/** Post-OAuth redirects must land on an allowlisted ChAi origin only. */
export function safeAppOrigin(requestOrigin: string): string {
  return isAllowedOrigin(requestOrigin)
    ? normalizeOrigin(requestOrigin)
    : PRODUCTION_ORIGIN;
}

// ---------------------------------------------------------------------------
// State lifecycle
// ---------------------------------------------------------------------------

type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

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
 * Atomically consumes a state value. The database function performs a single
 * `DELETE ... RETURNING`, so a second (or concurrent) callback with the same
 * state always loses.
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
 * Scrubs provider error payloads before they reach logs or the browser:
 * authorization codes, tokens and secrets must never be echoed.
 */
export function sanitizeOAuthError(message: string): string {
  return message
    .replace(/(code|access_token|refresh_token|client_secret|id_token)=[^&\s"']+/gi, "$1=[redacted]")
    .replace(/"(access_token|refresh_token|client_secret|code)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .slice(0, 160);
}
