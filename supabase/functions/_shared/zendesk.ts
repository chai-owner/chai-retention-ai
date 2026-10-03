// Ported verbatim (sync path) from src/lib/zendesk.server.ts. Self-contained:
// your own global Zendesk OAuth client (ZENDESK_CLIENT_ID/SECRET), tokens
// stored encrypted in your own DB. OAuth-flow helpers (authorize URL,
// exchange) were dropped since the cron job only needs the sync path and the
// refresh/API-call path.
import type { ExtractedDataset } from "./types.ts";
import { encryptSecret, decryptSecret, decryptSecretOrNull } from "./crypto.ts";
import { getSupabaseAdmin } from "./client.ts";

const REFRESH_SKEW_MS = 2 * 60 * 1000;

function getZendeskCreds(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("ZENDESK_CLIENT_ID");
  const clientSecret = Deno.env.get("ZENDESK_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Zendesk isn't configured. Missing ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

function zendeskHost(subdomain: string): string {
  return `https://${subdomain}.zendesk.com`;
}

interface TokenSet {
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

async function admin() {
  return getSupabaseAdmin();
}

async function refreshZendeskToken(subdomain: string, refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  const res = await fetch(`${zendeskHost(subdomain)}/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch { /* non-JSON error body */ }
  if (!res.ok || json.error) {
    throw new Error(`Zendesk token refresh failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    refreshTokenExpiresAt: expiryFrom(json.refresh_token_expires_in),
    tokenType: json.token_type ?? "bearer",
    scope: json.scope,
  };
}

interface Row {
  id: string;
  user_id: string;
  subdomain: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_token_expires_at: string | null;
  status: string | null;
  refresh_lock_at: string | null;
}

class ZendeskReauthRequired extends Error {}

async function markZendeskNeedsReauth(userId: string, message: string): Promise<void> {
  const db = await admin();
  await db
    .from("zendesk_connections")
    .update({ status: "needs_reauth", last_error_at: new Date().toISOString(), last_error_message: message.slice(0, 300) })
    .eq("user_id", userId);
}

async function loadFreshZendeskConnection(userId: string): Promise<Row> {
  const db = await admin();
  const { data, error } = await db.from("zendesk_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Zendesk isn't connected for your account.");
  const row = data as unknown as Row;
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);

  if (row.status === "needs_reauth") throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");

  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const needsRefresh = expiresMs !== null && expiresMs - REFRESH_SKEW_MS < Date.now();
  if (!needsRefresh) return row;

  if (!row.refresh_token) {
    await markZendeskNeedsReauth(userId, "Access token expired and no refresh token is stored.");
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }
  const refreshExpired = row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() < Date.now();
  if (refreshExpired) {
    await markZendeskNeedsReauth(userId, "Zendesk refresh token expired.");
    throw new ZendeskReauthRequired("Your Zendesk connection needs to be reauthorized.");
  }

  return refreshWithLock(userId, row);
}

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

  const gotLock = Array.isArray(locked) ? locked.length > 0 : Boolean(locked);
  if (!gotLock) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db.from("zendesk_connections").select("*").eq("id", row.id).maybeSingle();
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

// deno-lint-ignore no-explicit-any
async function zendeskApi<T = any>(userId: string, path: string, init?: RequestInit): Promise<T> {
  let conn = await loadFreshZendeskConnection(userId);

  const call = async (token: string): Promise<Response> => {
    const url = path.startsWith("http") ? path : `${zendeskHost(conn.subdomain)}${path}`;
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, Accept: "application/json" } });
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
    throw new Error(`Zendesk API request failed [${res.status}]: ${body.slice(0, 300)}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

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
  "customer_id", "email", "customer_name", "company", "ticket_id", "created_date", "updated_date",
  "status", "priority", "category", "tags", "assignee_id", "satisfaction_score",
  "zendesk_user_id", "zendesk_organization_id",
];

function mapZendeskStatus(status: string): string {
  if (status === "solved" || status === "closed") return "resolved";
  if (status === "open" || status === "pending" || status === "hold" || status === "new") return "open";
  return status;
}

export async function syncZendeskForUser(userId: string, limit: number, since: string | null): Promise<ExtractedDataset[]> {
  const cap = Math.min(limit, 1000);
  const startTime = since ? Math.floor(new Date(since).getTime() / 1000) : Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  // deno-lint-ignore no-explicit-any
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
      toStr(t.requester_id), toStr(requester?.email), toStr(requester?.name), company,
      toStr(t.id), dateOnly(t.created_at), dateOnly(t.updated_at), mapZendeskStatus(toStr(t.status)),
      toStr(t.priority), toStr(t.subject).slice(0, 60),
      Array.isArray(t.tags) ? (t.tags as unknown[]).join("|") : "",
      toStr(t.assignee_id), sat ? num(sat) : "", toStr(t.requester_id), orgId != null ? toStr(orgId) : "",
    ];
  });

  if (!rows.length) return [];
  return [{ key: "support", label: "Support tickets", headers: SUPPORT_HEADERS, rows, confidence: 92, note: "Imported from Zendesk tickets." }];
}

// ---------------------------------------------------------------------------
// Interactive OAuth: start + callback (added so the "Connect Zendesk" flow no
// longer depends on the app's own hosting having ZENDESK_CLIENT_ID/SECRET).
// Ported from src/lib/zendesk.server.ts. Zendesk keeps its own state design
// (see oauth-callback/index.ts) rather than the shared oauth-state.ts table.
// ---------------------------------------------------------------------------

export const ZENDESK_SCOPE = "tickets:read users:read organizations:read satisfaction_ratings:read";
export const ZENDESK_STATE_TTL_MS = 15 * 60 * 1000;

/** Accepts "acme", "acme.zendesk.com", "https://acme.zendesk.com/agent" -> "acme". */
export function normalizeSubdomain(input: string): string {
  let s = (input ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] ?? "";
  s = s.replace(/\.zendesk\.com$/, "");
  s = s.replace(/\.$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(s)) {
    throw new Error("That doesn't look like a valid Zendesk subdomain. Enter it like: yourcompany or yourcompany.zendesk.com");
  }
  return s;
}

export function buildZendeskAuthorizeUrl(subdomain: string, redirectUri: string, state: string): string {
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

export async function exchangeZendeskCode(subdomain: string, code: string, redirectUri: string): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  const res = await fetch(`${zendeskHost(subdomain)}/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: ZENDESK_SCOPE,
    }),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch { /* non-JSON error body */ }
  if (!res.ok || json.error) {
    throw new Error(`ChAi could not connect to this Zendesk account (${json.error ?? res.status}). Please verify the Zendesk subdomain and try again.`);
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

/** Low-risk call right after OAuth to prove the connection works. */
export async function verifyZendeskConnection(
  subdomain: string,
  accessToken: string,
): Promise<{ id: string | null; email: string | null; name: string | null }> {
  const res = await fetch(`${zendeskHost(subdomain)}/api/v2/users/me.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ChAi could not verify this Zendesk connection (${res.status}). Please try again.`);
  }
  // deno-lint-ignore no-explicit-any
  let user: any = {};
  try {
    user = (text ? JSON.parse(text) : {}).user ?? {};
  } catch { /* ignore */ }
  return {
    id: user.id != null ? String(user.id) : null,
    email: user.email ?? null,
    name: user.organization_name ?? user.name ?? null,
  };
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

  // Seed support_sync_state the same way the app's own saveZendeskConnection
  // does, so the first daily-sync run has a row to update.
  const { data: existing } = await db
    .from("support_sync_state")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "zendesk")
    .maybeSingle();
  if (!existing) {
    await db.from("support_sync_state").insert({ user_id: userId, provider: "zendesk", last_synced_at: null });
  }
}
