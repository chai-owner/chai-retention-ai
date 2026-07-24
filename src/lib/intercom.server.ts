// Server-only helpers for Intercom per-user OAuth. Each user connects their
// own Intercom workspace; we store a long-lived access token and sync
// conversations into the ingested_support table. Never import from client.
import type { ExtractedDataset } from "./ingest.functions";

const INTERCOM_API_VERSION = "2.11";
const INTERCOM_API_BASE = "https://api.intercom.io";
const INTERCOM_AUTHORIZE_URL = "https://app.intercom.com/oauth";
const INTERCOM_TOKEN_URL = `${INTERCOM_API_BASE}/auth/eagle/token`;

export function getIntercomCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.INTERCOM_CLIENT_ID;
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Intercom isn't configured. Missing INTERCOM_CLIENT_ID / INTERCOM_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

export function hasIntercomCreds(): boolean {
  try {
    getIntercomCreds();
    return true;
  } catch {
    return false;
  }
}

export function buildIntercomAuthorizeUrl(state: string): string {
  const { clientId } = getIntercomCreds();
  const p = new URLSearchParams({
    client_id: clientId,
    state,
    response_type: "code",
  });
  return `${INTERCOM_AUTHORIZE_URL}?${p}`;
}

interface TokenSet {
  accessToken: string;
  scope?: string;
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

export async function exchangeIntercomCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret } = getIntercomCreds();
  const res = await fetch(INTERCOM_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const j = await readJson(res, "Intercom token exchange");
  if (!j.access_token) throw new Error("Intercom token exchange returned no access_token");
  return { accessToken: j.access_token, scope: j.scope };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Intercom-Version": INTERCOM_API_VERSION,
  };
}

async function fetchIntercomMe(token: string): Promise<{
  workspaceId: string | null;
  workspaceName: string | null;
  appId: string | null;
}> {
  const res = await fetch(`${INTERCOM_API_BASE}/me`, { headers: authHeaders(token) });
  if (!res.ok) return { workspaceId: null, workspaceName: null, appId: null };
  const j = (await res.json()) as {
    app?: { id_code?: string; name?: string; id?: string };
  };
  const app = j.app ?? {};
  return {
    workspaceId: app.id_code ?? null,
    workspaceName: app.name ?? null,
    appId: app.id ? String(app.id) : app.id_code ?? null,
  };
}

export async function saveIntercomConnection(
  userId: string,
  tokens: TokenSet,
): Promise<{ workspaceName: string | null }> {
  const meta = await fetchIntercomMe(tokens.accessToken);
  const db = await admin();
  const { error } = await db.from("intercom_connections").upsert(
    {
      user_id: userId,
      access_token: tokens.accessToken,
      scope: tokens.scope ?? null,
      workspace_id: meta.workspaceId,
      workspace_name: meta.workspaceName,
      app_id: meta.appId,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to save Intercom connection: ${error.message}`);
  return { workspaceName: meta.workspaceName };
}

interface Row {
  id: string;
  user_id: string;
  access_token: string;
  workspace_name: string | null;
  workspace_id: string | null;
  last_synced_at: string | null;
}

async function loadIntercomConnection(userId: string): Promise<Row> {
  const db = await admin();
  const { data, error } = await db
    .from("intercom_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Intercom isn't connected for your account.");
  return data as Row;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}
function dateFromEpoch(v: unknown): string {
  const n = Number(v);
  if (!n || isNaN(n)) return "";
  return new Date(n * 1000).toISOString().slice(0, 10);
}

const SUPPORT_HEADERS = [
  "customer_id",
  "ticket_id",
  "created_date",
  "status",
  "category",
  "satisfaction_score",
];

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
  source?: { subject?: string; author?: { email?: string; id?: string } };
  contacts?: { contacts?: Array<{ id?: string; external_id?: string }> };
  conversation_rating?: { rating?: number };
}

export async function syncIntercomForUser(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const conn = await loadIntercomConnection(userId);
  const cap = Math.min(limit, 500);
  const sinceEpoch = since
    ? Math.floor(new Date(since).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  // Search conversations updated since `sinceEpoch`, newest first.
  const body = {
    query: {
      field: "updated_at",
      operator: ">",
      value: sinceEpoch,
    },
    pagination: { per_page: Math.min(cap, 150) },
    sort: { field: "updated_at", order: "descending" },
  };

  const res = await fetch(`${INTERCOM_API_BASE}/conversations/search`, {
    method: "POST",
    headers: {
      ...authHeaders(conn.access_token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Intercom rate limit hit — please try again in a moment.");
  const text = await res.text();
  if (!res.ok) throw new Error(`Intercom request failed [${res.status}]: ${text.slice(0, 300)}`);

  const j = text ? JSON.parse(text) : {};
  const conversations: IntercomConversation[] = (j.conversations ?? []) as IntercomConversation[];

  const rows: string[][] = conversations.slice(0, cap).map((c) => {
    const contact = c.contacts?.contacts?.[0];
    const authorEmail = c.source?.author?.email ?? "";
    const customerId = authorEmail || contact?.external_id || contact?.id || toStr(c.source?.author?.id);
    const rating = c.conversation_rating?.rating;
    return [
      toStr(customerId),
      toStr(c.id),
      dateFromEpoch(c.created_at),
      mapIntercomState(toStr(c.state)),
      toStr(c.source?.subject).slice(0, 60),
      rating != null ? String(rating) : "",
    ];
  });

  if (!rows.length) return [];
  return [
    {
      key: "support",
      label: "Support conversations",
      headers: SUPPORT_HEADERS,
      rows,
      confidence: 92,
      note: "Imported from Intercom conversations.",
    },
  ];
}

export async function getIntercomStatusRow(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("intercom_connections")
    .select("workspace_name, workspace_id, connected_at, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    workspace_name: string | null;
    workspace_id: string | null;
    connected_at: string;
    last_synced_at: string | null;
  } | null;
}

export async function deleteIntercomConnection(userId: string) {
  const db = await admin();
  const { error } = await db.from("intercom_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
