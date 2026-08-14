// Server-only helpers for the Freshdesk integration. Each user connects with
// their Freshdesk domain (e.g. "acme" for acme.freshdesk.com) and a personal
// API key (found in Freshdesk → Profile settings → View API Key). We store
// the API key AES-256-GCM encrypted and pull tickets on their behalf.
import type { ExtractedDataset } from "./ingest.functions";
import {
  encryptConnectionKey,
  decryptConnectionKey,
} from "./connection-key-crypto.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function freshdeskHost(domain: string): string {
  const d = domain.trim().toLowerCase().replace(/\.freshdesk\.com$/, "");
  return `https://${d}.freshdesk.com`;
}

function basicAuth(apiKey: string): string {
  // Freshdesk uses HTTP basic auth: username = API key, password = "X".
  return `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
}

// Verifies the credentials work and returns the account/company name.
async function fetchFreshdeskAccount(
  domain: string,
  apiKey: string,
): Promise<{ name: string | null }> {
  const res = await fetch(`${freshdeskHost(domain)}/api/v2/settings/helpdesk`, {
    headers: { Authorization: basicAuth(apiKey), Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Freshdesk rejected those credentials. Check the domain and API key.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Freshdesk request failed [${res.status}]: ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as { primary_language?: string; name?: string };
  return { name: j.name ?? null };
}

export async function saveFreshdeskConnection(
  userId: string,
  domain: string,
  apiKey: string,
): Promise<{ accountName: string | null }> {
  const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.freshdesk\.com.*$/, "");
  if (!/^[a-z0-9-]+$/.test(cleaned)) {
    throw new Error("Domain must look like 'acme' (from acme.freshdesk.com).");
  }
  const meta = await fetchFreshdeskAccount(cleaned, apiKey);
  const db = await admin();
  const { error } = await db.from("freshdesk_connections").upsert(
    {
      user_id: userId,
      domain: cleaned,
      api_key_ciphertext: encryptConnectionKey(apiKey),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to save Freshdesk connection: ${error.message}`);
  return { accountName: meta.name };
}

interface Row {
  id: string;
  user_id: string;
  domain: string;
  api_key_ciphertext: string;
  connected_at: string;
  last_synced_at: string | null;
}

async function loadFreshdeskConnection(userId: string): Promise<Row & { apiKey: string }> {
  const db = await admin();
  const { data, error } = await db
    .from("freshdesk_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Freshdesk isn't connected for your account.");
  const row = data as Row;
  return { ...row, apiKey: decryptConnectionKey(row.api_key_ciphertext) };
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

// Freshdesk numeric status codes.
function mapFreshdeskStatus(status: unknown): string {
  const n = Number(status);
  if (n === 4 || n === 5) return "resolved"; // 4=Resolved, 5=Closed
  if (n === 2 || n === 3 || n === 6 || n === 7) return "open"; // 2=Open, 3=Pending, 6=Waiting on Customer, 7=Waiting on Third Party
  return "open";
}

interface FreshdeskTicket {
  id: number;
  requester_id?: number;
  created_at?: string;
  updated_at?: string;
  status?: number;
  subject?: string;
  type?: string | null;
}

interface FreshdeskContact {
  id: number;
  email?: string | null;
}

interface FreshdeskCsat {
  ticket_id?: number;
  ratings?: { default_question?: number };
}

async function fetchAllContactsById(
  domain: string,
  apiKey: string,
  ids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  // Batch lookups by id — Freshdesk contacts endpoint doesn't accept filter by array,
  // so fetch one page (100) at a time using ?_updated_since and rely on caller providing ids.
  // Simpler: fetch each id (up to 50) — bounded by ticket page size.
  const unique = [...new Set(ids)].slice(0, 100);
  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${freshdeskHost(domain)}/api/v2/contacts/${id}`, {
          headers: { Authorization: basicAuth(apiKey), Accept: "application/json" },
        });
        if (!res.ok) return;
        const c = (await res.json()) as FreshdeskContact;
        if (c.email) out.set(id, c.email);
      } catch {
        /* ignore individual contact errors */
      }
    }),
  );
  return out;
}

export async function syncFreshdeskForUser(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const conn = await loadFreshdeskConnection(userId);
  const cap = Math.min(limit, 100); // Freshdesk max per_page = 100.
  const updatedSince = since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const url = `${freshdeskHost(conn.domain)}/api/v2/tickets?updated_since=${encodeURIComponent(
    updatedSince,
  )}&per_page=${cap}&order_by=updated_at&order_type=desc`;

  const res = await fetch(url, {
    headers: { Authorization: basicAuth(conn.apiKey), Accept: "application/json" },
  });
  if (res.status === 429) throw new Error("Freshdesk rate limit hit — please try again in a moment.");
  const body = await res.text();
  if (!res.ok) throw new Error(`Freshdesk request failed [${res.status}]: ${body.slice(0, 300)}`);

  const tickets: FreshdeskTicket[] = body ? (JSON.parse(body) as FreshdeskTicket[]) : [];
  const sliced = tickets.slice(0, cap);
  if (!sliced.length) return [];

  const requesterIds = sliced
    .map((t) => t.requester_id)
    .filter((x): x is number => typeof x === "number");
  const emailById = await fetchAllContactsById(conn.domain, conn.apiKey, requesterIds);

  // Try to pull CSAT scores for these tickets. Best-effort — silently skip if the
  // account doesn't have satisfaction surveys enabled.
  const csatByTicket = new Map<number, number>();
  try {
    const csatRes = await fetch(
      `${freshdeskHost(conn.domain)}/api/v2/surveys/satisfaction_ratings?created_since=${encodeURIComponent(updatedSince)}`,
      { headers: { Authorization: basicAuth(conn.apiKey), Accept: "application/json" } },
    );
    if (csatRes.ok) {
      const ratings = (await csatRes.json()) as FreshdeskCsat[];
      for (const r of ratings) {
        if (r.ticket_id && r.ratings?.default_question != null) {
          csatByTicket.set(r.ticket_id, r.ratings.default_question);
        }
      }
    }
  } catch {
    /* CSAT is optional */
  }

  const rows: string[][] = sliced.map((t) => {
    const email = t.requester_id ? emailById.get(t.requester_id) : undefined;
    const rating = csatByTicket.get(t.id);
    return [
      email || toStr(t.requester_id),
      toStr(t.id),
      dateOnly(t.created_at),
      mapFreshdeskStatus(t.status),
      toStr(t.subject).slice(0, 60),
      rating != null ? String(rating) : "",
    ];
  });

  return [
    {
      key: "support",
      label: "Support tickets",
      headers: SUPPORT_HEADERS,
      rows,
      confidence: 92,
      note: "Imported from Freshdesk tickets.",
    },
  ];
}

export async function getFreshdeskStatusRow(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("freshdesk_connections")
    .select("domain, connected_at, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    domain: string;
    connected_at: string;
    last_synced_at: string | null;
  } | null;
}

export async function deleteFreshdeskConnection(userId: string) {
  const db = await admin();
  const { error } = await db.from("freshdesk_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
