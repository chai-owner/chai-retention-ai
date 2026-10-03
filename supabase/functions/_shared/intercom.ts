// Ported verbatim (sync path) from src/lib/intercom.server.ts. Self-contained:
// your own Intercom OAuth app (INTERCOM_CLIENT_ID/SECRET), long-lived access
// token stored encrypted in your own DB.
import type { ExtractedDataset } from "./types.ts";
import { encryptSecret, decryptSecret } from "./crypto.ts";
import { getSupabaseAdmin } from "./client.ts";

const INTERCOM_API_VERSION = "2.11";
export const INTERCOM_REGIONS = {
  us: "api.intercom.io",
  eu: "api.eu.intercom.io",
  au: "api.au.intercom.io",
} as const;
export type IntercomRegion = keyof typeof INTERCOM_REGIONS;
export const INTERCOM_REGION_ORDER: IntercomRegion[] = ["us", "eu", "au"];

export function isAllowedIntercomHost(host: string | null | undefined): boolean {
  return Object.values(INTERCOM_REGIONS).includes((host ?? "") as never);
}
function regionForHost(host: string): IntercomRegion | null {
  const hit = INTERCOM_REGION_ORDER.find((r) => INTERCOM_REGIONS[r] === host);
  return hit ?? null;
}
function resolveIntercomHost(region: string | null | undefined, apiHost?: string | null): { region: IntercomRegion; apiHost: string } {
  if (apiHost && isAllowedIntercomHost(apiHost)) {
    const r = regionForHost(apiHost)!;
    return { region: r, apiHost };
  }
  const key = String(region ?? "").toLowerCase() as IntercomRegion;
  if (key in INTERCOM_REGIONS) return { region: key, apiHost: INTERCOM_REGIONS[key] };
  return { region: "us", apiHost: INTERCOM_REGIONS.us };
}

async function admin() {
  return getSupabaseAdmin();
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "Intercom-Version": INTERCOM_API_VERSION };
}

interface Row {
  id: string;
  user_id: string;
  access_token: string;
  workspace_name: string | null;
  workspace_id: string | null;
  region: string | null;
  api_host: string | null;
  last_synced_at: string | null;
}

async function loadIntercomConnection(userId: string): Promise<Row & { apiHost: string }> {
  const db = await admin();
  const { data, error } = await db.from("intercom_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Intercom isn't connected for your account.");
  const row = data as Row;
  row.access_token = decryptSecret(row.access_token);
  const { apiHost } = resolveIntercomHost(row.region, row.api_host);
  return { ...row, apiHost };
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}
function dateFromEpoch(v: unknown): string {
  const n = Number(v);
  if (!n || isNaN(n)) return "";
  return new Date(n * 1000).toISOString().slice(0, 10);
}

const SUPPORT_HEADERS = ["customer_id", "email", "customer_name", "ticket_id", "created_date", "status", "category", "satisfaction_score"];

function mapIntercomState(state: string): string {
  if (state === "closed") return "resolved";
  if (state === "open" || state === "snoozed") return "open";
  return state || "open";
}

interface IntercomConversation {
  id: string | number;
  created_at?: number;
  updated_at?: number;
  state?: string;
  source?: { subject?: string; author?: { email?: string; id?: string; name?: string } };
  contacts?: { contacts?: Array<{ id?: string; external_id?: string; email?: string; name?: string }> };
  conversation_rating?: { rating?: number };
}

export async function syncIntercomForUser(userId: string, limit: number, since: string | null): Promise<ExtractedDataset[]> {
  const conn = await loadIntercomConnection(userId);
  const cap = Math.min(limit, 500);
  const sinceEpoch = since ? Math.floor(new Date(since).getTime() / 1000) : Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  const body = {
    query: { field: "updated_at", operator: ">", value: sinceEpoch },
    pagination: { per_page: Math.min(cap, 150) },
    sort: { field: "updated_at", order: "descending" },
  };

  const res = await fetch(`https://${conn.apiHost}/conversations/search`, {
    method: "POST",
    headers: { ...authHeaders(conn.access_token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Intercom rate limit hit — please try again in a moment.");
  const text = await res.text();
  if (!res.ok) throw new Error(`Intercom request failed [${res.status}]: ${text.slice(0, 300)}`);

  const j = text ? JSON.parse(text) : {};
  const conversations: IntercomConversation[] = (j.conversations ?? []) as IntercomConversation[];

  const rows: string[][] = conversations.slice(0, cap).map((c) => {
    const contact = c.contacts?.contacts?.[0];
    const authorEmail = c.source?.author?.email ?? contact?.email ?? "";
    const customerId = contact?.external_id || contact?.id || toStr(c.source?.author?.id) || authorEmail;
    const customerName = contact?.name ?? c.source?.author?.name ?? "";
    const rating = c.conversation_rating?.rating;
    return [
      toStr(customerId), toStr(authorEmail), toStr(customerName), toStr(c.id),
      dateFromEpoch(c.created_at), mapIntercomState(toStr(c.state)), toStr(c.source?.subject).slice(0, 60),
      rating != null ? String(rating) : "",
    ];
  });

  if (!rows.length) return [];
  return [{ key: "support", label: "Support conversations", headers: SUPPORT_HEADERS, rows, confidence: 92, note: "Imported from Intercom conversations." }];
}

// ---------------------------------------------------------------------------
// Interactive OAuth: start + callback (added so the "Connect Intercom" flow
// no longer depends on the app's own hosting having INTERCOM_CLIENT_ID/
// SECRET). Ported from src/lib/intercom.server.ts.
// ---------------------------------------------------------------------------

const INTERCOM_API_BASE = `https://${INTERCOM_REGIONS.us}`;
const INTERCOM_AUTHORIZE_URL = "https://app.intercom.com/oauth";
const INTERCOM_TOKEN_URL = `${INTERCOM_API_BASE}/auth/eagle/token`;

export function getIntercomCreds(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("INTERCOM_CLIENT_ID");
  const clientSecret = Deno.env.get("INTERCOM_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Intercom isn't configured. Missing INTERCOM_CLIENT_ID / INTERCOM_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

export function buildIntercomAuthorizeUrl(state: string, redirectUri?: string): string {
  const { clientId } = getIntercomCreds();
  const p = new URLSearchParams({ client_id: clientId, state, response_type: "code" });
  if (redirectUri) p.set("redirect_uri", redirectUri);
  return `${INTERCOM_AUTHORIZE_URL}?${p}`;
}

interface OAuthTokenSet {
  accessToken: string;
  scope?: string;
}

export async function exchangeIntercomCode(code: string, redirectUri?: string): Promise<OAuthTokenSet> {
  const { clientId, clientSecret } = getIntercomCreds();
  const res = await fetch(INTERCOM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Intercom token exchange failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  // deno-lint-ignore no-explicit-any
  const j: any = text ? JSON.parse(text) : {};
  if (!j.access_token) throw new Error("Intercom token exchange returned no access_token");
  return { accessToken: j.access_token, scope: j.scope };
}

interface IntercomIdentity {
  workspaceId: string | null;
  workspaceName: string | null;
  appId: string | null;
  region: IntercomRegion;
  apiHost: string;
}

/**
 * Determines the workspace's data region authoritatively: an access token is
 * only accepted by the region that actually hosts the workspace, so we probe
 * the allowlisted regional hosts and keep the one that answers.
 */
export async function detectIntercomRegion(token: string): Promise<IntercomIdentity> {
  let lastStatus = 0;
  for (const region of INTERCOM_REGION_ORDER) {
    const apiHost = INTERCOM_REGIONS[region];
    let res: Response;
    try {
      res = await fetch(`https://${apiHost}/me`, { headers: authHeaders(token) });
    } catch {
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      lastStatus = res.status;
      continue;
    }
    if (!res.ok) {
      lastStatus = res.status;
      continue;
    }
    // deno-lint-ignore no-explicit-any
    const j: any = await res.json();
    const app = j.app ?? {};
    const workspaceId: string | null = app.id_code ?? null;
    const workspaceName: string | null = app.name ?? null;
    const appId: string | null = app.id ? String(app.id) : app.id_code ?? null;
    const reportedRegion: string | null = app.region ? String(app.region).toLowerCase() : null;
    const reported = reportedRegion && reportedRegion in INTERCOM_REGIONS ? (reportedRegion as IntercomRegion) : null;
    const resolved = resolveIntercomHost(reported ?? region);
    return { workspaceId, workspaceName, appId, region: resolved.region, apiHost: resolved.apiHost };
  }
  throw new Error(
    `We couldn't confirm which Intercom region hosts your workspace${lastStatus ? ` (last response ${lastStatus})` : ""}. Please try connecting again.`,
  );
}

export async function saveIntercomConnection(
  userId: string,
  tokens: OAuthTokenSet,
): Promise<{ workspaceName: string | null; region: IntercomRegion }> {
  const meta = await detectIntercomRegion(tokens.accessToken);
  const db = await admin();
  const { error } = await db.from("intercom_connections").upsert(
    {
      user_id: userId,
      access_token: encryptSecret(tokens.accessToken),
      scope: tokens.scope ?? null,
      workspace_id: meta.workspaceId,
      workspace_name: meta.workspaceName,
      app_id: meta.appId,
      region: meta.region,
      api_host: meta.apiHost,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to save Intercom connection: ${error.message}`);

  const { data: existing } = await db
    .from("support_sync_state")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "intercom")
    .maybeSingle();
  if (!existing) {
    await db.from("support_sync_state").insert({ user_id: userId, provider: "intercom", last_synced_at: null });
  }
  return { workspaceName: meta.workspaceName, region: meta.region };
}
