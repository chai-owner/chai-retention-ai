// Server-only helpers for Zendesk per-user OAuth. Each user connects their
// own Zendesk account; we store their access/refresh tokens and sync support
// tickets into the ingested_* tables. Never import from client code.
import type { ExtractedDataset } from "./ingest.functions";

export const ZENDESK_SCOPE = "read";

export function getZendeskCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ZENDESK_CLIENT_ID;
  const clientSecret = process.env.ZENDESK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Zendesk isn't configured. Missing ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET.",
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

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

function expiryFrom(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  return new Date(Date.now() + (seconds - 60) * 1000).toISOString();
}

async function readJson(res: Response, ctx: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`${ctx} failed [${res.status}]: ${text}`);
    throw new Error(`${ctx} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${ctx}: invalid JSON`);
  }
}

export async function exchangeZendeskCode(
  subdomain: string,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  const res = await fetch(`${zendeskHost(subdomain)}/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: ZENDESK_SCOPE,
    }),
  });
  const j = await readJson(res, "Zendesk token exchange");
  if (j.error) throw new Error(`Zendesk token exchange failed: ${j.error}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: expiryFrom(j.expires_in),
  };
}

async function refreshZendeskToken(
  subdomain: string,
  refreshToken: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = getZendeskCreds();
  const res = await fetch(`${zendeskHost(subdomain)}/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: ZENDESK_SCOPE,
    }),
  });
  const j = await readJson(res, "Zendesk token refresh");
  if (j.error) throw new Error(`Zendesk token refresh failed: ${j.error}`);
  return {
    accessToken: j.access_token,
    refreshToken,
    expiresAt: expiryFrom(j.expires_in),
  };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveZendeskConnection(
  userId: string,
  subdomain: string,
  tokens: TokenSet,
): Promise<void> {
  const db = await admin();
  const { error } = await db.from("zendesk_connections").upsert(
    {
      user_id: userId,
      subdomain,
      access_token: encryptSecret(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt ?? null,
      scope: ZENDESK_SCOPE,
      org_name: subdomain,
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
  org_name: string | null;
  last_synced_at: string | null;
}

async function loadFreshZendeskConnection(userId: string): Promise<Row> {
  const db = await admin();
  const { data, error } = await db
    .from("zendesk_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Zendesk isn't connected for your account.");
  const row = data as Row;
  // Values written before token-at-rest encryption are still plaintext.
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  if (expired && row.refresh_token) {
    const refreshed = await refreshZendeskToken(row.subdomain, row.refresh_token);
    await db
      .from("zendesk_connections")
      .update({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
        expires_at: refreshed.expiresAt ?? null,
      })
      .eq("id", row.id);
    row.access_token = refreshed.accessToken;
    row.refresh_token = refreshed.refreshToken ?? null;
    row.expires_at = refreshed.expiresAt ?? null;
  }
  return row;
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
  "customer_id",
  "email",
  "customer_name",
  "ticket_id",
  "created_date",
  "status",
  "category",
  "satisfaction_score",
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
  const conn = await loadFreshZendeskConnection(userId);
  const cap = Math.min(limit, 1000);
  const startTime = since
    ? Math.floor(new Date(since).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60; // 1 year ago if no prior sync

  const url = `${zendeskHost(conn.subdomain)}/api/v2/incremental/tickets.json?start_time=${startTime}&per_page=${cap}&include=users`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 429) throw new Error("Zendesk rate limit hit — please try again in a moment.");
  const body = await res.text();
  if (!res.ok) throw new Error(`Zendesk request failed [${res.status}]: ${body.slice(0, 300)}`);

  const j = body ? JSON.parse(body) : {};
  const tickets: Record<string, unknown>[] = (j.tickets ?? []) as Record<string, unknown>[];
  const users: Record<string, unknown>[] = (j.users ?? []) as Record<string, unknown>[];
  const userById = new Map<string, Record<string, unknown>>();
  for (const u of users) userById.set(String(u.id), u);
  const requesterEmail = (id: unknown) => {
    const u = userById.get(String(id));
    return u ? String(u.email ?? "") : "";
  };
  const requesterName = (id: unknown) => {
    const u = userById.get(String(id));
    return u ? String(u.organization_name ?? u.name ?? "") : "";
  };

  const rows: string[][] = tickets.slice(0, cap).map((t) => {
    const sat = (t.satisfaction_rating as { score?: string | number } | undefined)?.score;
    return [
      // Keep the platform's own id here; email/name are separate identifiers so
      // Identity Resolution can auto-match against the customer roster.
      toStr(t.requester_id),
      requesterEmail(t.requester_id),
      requesterName(t.requester_id),
      toStr(t.id),
      dateOnly(t.created_at),
      mapZendeskStatus(toStr(t.status)),
      toStr(t.subject).slice(0, 60),
      sat ? num(sat) : "",
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

export async function getZendeskStatusRow(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("zendesk_connections")
    .select("org_name, connected_at, subdomain, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    org_name: string | null;
    connected_at: string;
    subdomain: string;
    last_synced_at: string | null;
  } | null;
}

export async function deleteZendeskConnection(userId: string) {
  const db = await admin();
  const { error } = await db.from("zendesk_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
