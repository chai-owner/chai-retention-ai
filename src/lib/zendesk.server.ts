// Server-only helpers for the Zendesk integration.
//
// ChAi uses ONE Zendesk *global* OAuth client (ZENDESK_CLIENT_ID /
// ZENDESK_CLIENT_SECRET). Each ChAi account (tenant) connects their own
// Zendesk instance by entering their subdomain; ChAi never asks them to create
// an OAuth client of their own. Tokens are encrypted at rest and every read is
// scoped to the authenticated ChAi user id — never an id supplied by the
// browser. Never import this module from client code.
import type { ExtractedDataset } from "./ingest.functions";
import {
  encryptSecret,
  decryptSecret,
  decryptSecretOrNull,
} from "./connection-key-crypto.server";

export const ZENDESK_SCOPE = "read";
/** State older than this is rejected on callback. */
export const STATE_TTL_MS = 15 * 60 * 1000;
/** Refresh the access token this long before it actually expires. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export type ZendeskConnectionStatus = "connected" | "needs_reauth" | "error";

// ---------------------------------------------------------------- config ---

export function getZendeskCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ZENDESK_CLIENT_ID;
  const clientSecret = process.env.ZENDESK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "ChAi could not start the Zendesk authorization process. Please verify the Zendesk connection configuration.",
    );
  }
  return { clientId, clientSecret };
}

export function hasZendeskCreds(): boolean {
  try {
    getZendeskCreds();
    return true;
  } catch {
    return false;
  }
}

/**
 * The single stable HTTPS callback URL registered with Zendesk for the global
 * client. Falls back to the current origin (dev/preview) when unset.
 */
export function getZendeskRedirectUri(originFallback: string): string {
  const configured = process.env.ZENDESK_REDIRECT_URI?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${originFallback.replace(/\/+$/, "")}/api/public/zendesk/callback`;
}

/** Accepts "acme", "acme.zendesk.com", "https://acme.zendesk.com/agent" → "acme". */
export function normalizeSubdomain(input: string): string {
  let s = (input ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] ?? "";
  s = s.replace(/\.zendesk\.com$/, "");
  s = s.replace(/\.$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(s)) {
    throw new Error(
      "That doesn't look like a valid Zendesk subdomain. Enter it like: yourcompany or yourcompany.zendesk.com",
    );
  }
  return s;
}

export function zendeskHost(subdomain: string): string {
  return `https://${subdomain}.zendesk.com`;
}

export function buildZendeskAuthorizeUrl(
  subdomain: string,
  redirectUri: string,
  state: string,
): string {
  const { clientId } = getZendeskCreds();
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ZENDESK_SCOPE,
    state,
  });
  return `${zendeskHost(subdomain)}/oauth/authorizations/new?${p}`;
}

// ------------------------------------------------------------ diagnostics ---

/** Safe log: never includes secrets, codes or tokens. */
export function logZendeskDiagnostic(info: {
  stage: string;
  subdomain: string;
  status?: number;
  errorCode?: string;
  correlationId?: string | null;
  detail?: string;
}) {
  console.error(
    "[zendesk]",
    JSON.stringify({
      stage: info.stage,
      subdomain: info.subdomain,
      http_status: info.status ?? null,
      zendesk_error: info.errorCode ?? null,
      correlation_id: info.correlationId ?? null,
      detail: info.detail?.slice(0, 300) ?? null,
    }),
  );
}

/** Maps a Zendesk OAuth/API failure to a human-readable ChAi message. */
export function humanZendeskError(status: number, code: string | undefined, subdomain: string): string {
  if (code === "access_denied") return "Zendesk connection was cancelled.";
  if (code === "invalid_client" || /no such client/i.test(code ?? ""))
    return "ChAi could not start the Zendesk authorization process. Please verify the Zendesk connection configuration.";
  if (code === "unauthorized_client")
    return "ChAi isn't authorized on this Zendesk account. Please verify the Zendesk subdomain and try again.";
  switch (status) {
    case 400:
      return `ChAi could not connect to this Zendesk account. Please verify the Zendesk subdomain (${subdomain}) and try again.`;
    case 401:
      return "Your Zendesk connection needs to be reauthorized.";
    case 403:
      return "Your Zendesk user doesn't have permission for this data. Ask a Zendesk admin to grant read access.";
    case 404:
      return `ChAi could not reach ${subdomain}.zendesk.com. Please verify the Zendesk subdomain and try again.`;
    case 409:
      return "Zendesk reported a conflict with this request. Please try again.";
    case 429:
      return "Zendesk rate limit hit — please try again in a moment.";
    case 500:
    case 502:
    case 503:
      return "Zendesk is temporarily unavailable. Please try again shortly.";
    default:
      return "ChAi could not complete the Zendesk request. Please try again.";
  }
}

// ------------------------------------------------------------- token flow ---

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
  tokenType?: string;
  scope?: string;
}

function expiryFrom(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  return new Date(Date.now() + (seconds - 60) * 1000).toISOString();
}

async function postTokens(
  subdomain: string,
  body: Record<string, string>,
  stage: string,
): Promise<TokenSet> {
  const res = await fetch(`${zendeskHost(subdomain)}/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error body */
  }
  const code: string | undefined = json.error ?? json.description;
  if (!res.ok || json.error) {
    logZendeskDiagnostic({
      stage,
      subdomain,
      status: res.status,
      errorCode: typeof code === "string" ? code : undefined,
      correlationId: res.headers.get("x-zendesk-request-id"),
      // token bodies never contain the code/secret we sent, but keep it short
      detail: typeof json.description === "string" ? json.description : undefined,
    });
    throw new Error(humanZendeskError(res.status, typeof code === "string" ? code : undefined, subdomain));
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    refreshTokenExpiresAt: expiryFrom(json.refresh_token_expires_in),
    tokenType: json.token_type ?? "bearer",
    scope: json.scope ?? ZENDESK_SCOPE,
  };
}

export async function exchangeZendeskCode(
  subdomain: string,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  return postTokens(
    subdomain,
    {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: ZENDESK_SCOPE,
    },
    "token_exchange",
  );
}

export async function refreshZendeskToken(
  subdomain: string,
  refreshToken: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  return postTokens(
    subdomain,
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    "token_refresh",
  );
}

// ------------------------------------------------------------- persistence ---

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveZendeskConnection(
  userId: string,
  subdomain: string,
  tokens: TokenSet,
  account?: { id?: string | null; email?: string | null; name?: string | null },
): Promise<void> {
  const db = await admin();
  const { error } = await db.from("zendesk_connections").upsert(
    {
      user_id: userId,
      subdomain,
      access_token: encryptSecret(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt ?? null,
      refresh_token_expires_at: tokens.refreshTokenExpiresAt ?? null,
      token_type: tokens.tokenType ?? "bearer",
      scope: tokens.scope ?? ZENDESK_SCOPE,
      org_name: account?.name ?? subdomain,
      zendesk_account_id: account?.id ?? null,
      zendesk_account_email: account?.email ?? null,
      status: "connected",
      last_error_at: null,
      last_error_message: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to save Zendesk connection: ${error.message}`);
  const { ensureSupportSyncState } = await import("./support.server");
  await ensureSupportSyncState(userId, "zendesk");
}

interface Row {
  id: string;
  user_id: string;
  subdomain: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_token_expires_at: string | null;
  org_name: string | null;
  last_synced_at: string | null;
  status: string | null;
  refresh_lock_at: string | null;
}

export async function markZendeskNeedsReauth(userId: string, message: string): Promise<void> {
  const db = await admin();
  await db
    .from("zendesk_connections")
    .update({
      status: "needs_reauth",
      last_error_at: new Date().toISOString(),
      last_error_message: message.slice(0, 300),
    })
    .eq("user_id", userId);
}

export async function markZendeskError(userId: string, message: string): Promise<void> {
  const db = await admin();
  await db
    .from("zendesk_connections")
    .update({
      status: "error",
      last_error_at: new Date().toISOString(),
      last_error_message: message.slice(0, 300),
    })
    .eq("user_id", userId);
}

class ZendeskReauthRequired extends Error {}

/**
 * Loads the caller's own connection, refreshing (and rotating) the token when
 * needed. Ownership is enforced by the user_id filter — connection ids are
 * never accepted from the browser.
 */
async function loadFreshZendeskConnection(userId: string): Promise<Row> {
  const db = await admin();
  const { data, error } = await db
    .from("zendesk_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Zendesk isn't connected for your account.");
  const row = data as unknown as Row;
  // Values written before token-at-rest encryption are still plaintext.
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);

  if (row.status === "needs_reauth") {
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }

  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const needsRefresh = expiresMs !== null && expiresMs - REFRESH_SKEW_MS < Date.now();
  if (!needsRefresh) return row;

  if (!row.refresh_token) {
    await markZendeskNeedsReauth(userId, "Access token expired and no refresh token is stored.");
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }
  const refreshExpired =
    row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() < Date.now();
  if (refreshExpired) {
    await markZendeskNeedsReauth(userId, "Zendesk refresh token expired.");
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }

  return refreshWithLock(userId, row);
}

/**
 * Concurrency guard: only one request may rotate the refresh token at a time.
 * Losers wait and re-read the row rather than firing a second rotation with an
 * already-consumed refresh token.
 */
async function refreshWithLock(userId: string, row: Row): Promise<Row> {
  const db = await admin();
  const now = Date.now();
  const staleLock = new Date(now - 30_000).toISOString();
  const { data: locked } = await db
    .from("zendesk_connections")
    .update({ refresh_lock_at: new Date(now).toISOString() })
    .eq("id", row.id)
    .or(`refresh_lock_at.is.null,refresh_lock_at.lt.${staleLock}`)
    .select("id");

  if (!locked || locked.length === 0) {
    // Another request is rotating — wait briefly, then re-read.
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db
      .from("zendesk_connections")
      .select("*")
      .eq("id", row.id)
      .maybeSingle();
    if (!data) throw new Error("Zendesk isn't connected for your account.");
    const fresh = data as unknown as Row;
    fresh.access_token = decryptSecret(fresh.access_token);
    fresh.refresh_token = decryptSecretOrNull(fresh.refresh_token);
    return fresh;
  }

  try {
    const t = await refreshZendeskToken(row.subdomain, row.refresh_token!);
    await db
      .from("zendesk_connections")
      .update({
        access_token: encryptSecret(t.accessToken),
        // Zendesk rotates the refresh token — always store the newest one.
        refresh_token: t.refreshToken ? encryptSecret(t.refreshToken) : null,
        expires_at: t.expiresAt ?? null,
        refresh_token_expires_at: t.refreshTokenExpiresAt ?? null,
        token_type: t.tokenType ?? "bearer",
        status: "connected",
        last_error_at: null,
        last_error_message: null,
        refresh_lock_at: null,
      })
      .eq("id", row.id);
    row.access_token = t.accessToken;
    row.refresh_token = t.refreshToken ?? null;
    row.expires_at = t.expiresAt ?? null;
    row.refresh_token_expires_at = t.refreshTokenExpiresAt ?? null;
    row.status = "connected";
    return row;
  } catch (e) {
    await db.from("zendesk_connections").update({ refresh_lock_at: null }).eq("id", row.id);
    const msg = e instanceof Error ? e.message : "Zendesk token refresh failed.";
    await markZendeskNeedsReauth(userId, msg);
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }
}

// ------------------------------------------------------------- API client ---

/**
 * The single place Zendesk HTTP calls happen. Given the authenticated ChAi
 * user id it resolves *their* connection, refreshes when needed, retries once
 * on 401, and respects 429 Retry-After.
 */
export async function zendeskApi<T = any>(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let conn = await loadFreshZendeskConnection(userId);

  const call = async (token: string): Promise<Response> => {
    const url = path.startsWith("http") ? path : `${zendeskHost(conn.subdomain)}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  };

  let res = await call(conn.access_token);

  if (res.status === 401) {
    if (!conn.refresh_token) {
      await markZendeskNeedsReauth(userId, "Zendesk rejected the stored access token.");
      throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
    }
    conn = await refreshWithLock(userId, conn);
    res = await call(conn.access_token);
    if (res.status === 401) {
      await markZendeskNeedsReauth(userId, "Zendesk rejected the refreshed access token.");
      throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
    }
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "0");
    if (retryAfter > 0 && retryAfter <= 30) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      res = await call(conn.access_token);
    }
  }

  if (!res.ok) {
    const body = await res.text();
    logZendeskDiagnostic({
      stage: `api ${path.split("?")[0]}`,
      subdomain: conn.subdomain,
      status: res.status,
      correlationId: res.headers.get("x-zendesk-request-id"),
      detail: body,
    });
    const msg = humanZendeskError(res.status, undefined, conn.subdomain);
    if (res.status >= 500 || res.status === 429) await markZendeskError(userId, msg);
    throw new Error(msg);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export function isZendeskReauthError(e: unknown): boolean {
  return e instanceof ZendeskReauthRequired;
}

/** Low-risk call used right after OAuth to prove the connection works. */
export async function verifyZendeskConnection(
  subdomain: string,
  accessToken: string,
): Promise<{ id: string | null; email: string | null; name: string | null }> {
  const res = await fetch(`${zendeskHost(subdomain)}/api/v2/users/me.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    logZendeskDiagnostic({
      stage: "verify_connection",
      subdomain,
      status: res.status,
      correlationId: res.headers.get("x-zendesk-request-id"),
      detail: text,
    });
    throw new Error(humanZendeskError(res.status, undefined, subdomain));
  }
  let user: any = {};
  try {
    user = (text ? JSON.parse(text) : {}).user ?? {};
  } catch {
    /* ignore */
  }
  return {
    id: user.id != null ? String(user.id) : null,
    email: user.email ?? null,
    name: user.organization_name ?? user.name ?? null,
  };
}

// ------------------------------------------------------------------- sync ---

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}
function dateOnly(v: unknown): string {
  const s = toStr(v);
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function num(v: unknown): string {
  const s = toStr(v).replace(/[^0-9.\-]/g, "");
  return s === "" || isNaN(Number(s)) ? "" : String(Number(s));
}

const SUPPORT_HEADERS = [
  "customer_id",
  "email",
  "customer_name",
  "company",
  "ticket_id",
  "created_date",
  "updated_date",
  "status",
  "priority",
  "category",
  "tags",
  "assignee_id",
  "satisfaction_score",
  "zendesk_user_id",
  "zendesk_organization_id",
];

function mapZendeskStatus(status: string): string {
  if (status === "solved" || status === "closed") return "resolved";
  if (status === "open" || status === "pending" || status === "hold" || status === "new") return "open";
  return status;
}

export async function syncZendeskForUser(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const cap = Math.min(limit, 1000);
  const startTime = since
    ? Math.floor(new Date(since).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60; // 1 year ago if no prior sync

  const j = await zendeskApi<any>(
    userId,
    `/api/v2/incremental/tickets.json?start_time=${startTime}&per_page=${Math.min(cap, 1000)}&include=users,organizations`,
  );

  const tickets: Record<string, unknown>[] = (j.tickets ?? []) as Record<string, unknown>[];
  const users: Record<string, unknown>[] = (j.users ?? []) as Record<string, unknown>[];
  const orgs: Record<string, unknown>[] = (j.organizations ?? []) as Record<string, unknown>[];
  const userById = new Map<string, Record<string, unknown>>();
  for (const u of users) userById.set(String(u.id), u);
  const orgById = new Map<string, Record<string, unknown>>();
  for (const o of orgs) orgById.set(String(o.id), o);

  const rows: string[][] = tickets.slice(0, cap).map((t) => {
    const sat = (t.satisfaction_rating as { score?: string | number } | undefined)?.score;
    const requester = userById.get(String(t.requester_id));
    const orgId = (t.organization_id ?? requester?.organization_id) as unknown;
    const org = orgId != null ? orgById.get(String(orgId)) : undefined;
    const company = toStr(org?.name);
    return [
      // Zendesk's own id is the SOURCE id, not ChAi's canonical customer id.
      // Email / name / company travel alongside so Identity Resolution can
      // score a match instead of assuming ids line up across systems.
      toStr(t.requester_id),
      toStr(requester?.email),
      toStr(requester?.name),
      company,
      toStr(t.id),
      dateOnly(t.created_at),
      dateOnly(t.updated_at),
      mapZendeskStatus(toStr(t.status)),
      toStr(t.priority),
      toStr(t.subject).slice(0, 60),
      Array.isArray(t.tags) ? (t.tags as unknown[]).join("|") : "",
      toStr(t.assignee_id),
      sat ? num(sat) : "",
      toStr(t.requester_id),
      orgId != null ? toStr(orgId) : "",
    ];
  });

  if (!rows.length) return [];
  return [
    {
      key: "support",
      label: "Support tickets",
      headers: SUPPORT_HEADERS,
      rows,
      confidence: 92,
      note: "Imported from Zendesk tickets.",
    },
  ];
}

// ----------------------------------------------------------------- status ---

export async function getZendeskStatusRow(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("zendesk_connections")
    .select(
      "org_name, connected_at, subdomain, last_synced_at, status, last_error_message, zendesk_account_email",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    org_name: string | null;
    connected_at: string;
    subdomain: string;
    last_synced_at: string | null;
    status: string | null;
    last_error_message: string | null;
    zendesk_account_email: string | null;
  } | null;
}

/** Best-effort token revocation; failure never blocks disconnect. */
async function revokeZendeskToken(subdomain: string, accessToken: string): Promise<void> {
  try {
    const me = await fetch(`${zendeskHost(subdomain)}/api/v2/oauth/tokens/current.json`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!me.ok) {
      logZendeskDiagnostic({ stage: "revoke", subdomain, status: me.status });
    }
  } catch (e) {
    logZendeskDiagnostic({
      stage: "revoke",
      subdomain,
      detail: e instanceof Error ? e.message : "unknown",
    });
  }
}

export async function deleteZendeskConnection(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("zendesk_connections")
    .select("subdomain, access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.access_token) {
    await revokeZendeskToken(
      data.subdomain as string,
      decryptSecret(data.access_token as string),
    );
  }
  const { clearSupportSyncState } = await import("./support.server");
  await clearSupportSyncState(userId, "zendesk");
  // Only the credentials go away — imported analytics rows are preserved.
  const { error } = await db.from("zendesk_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
