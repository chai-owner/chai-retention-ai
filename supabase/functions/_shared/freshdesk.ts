// Ported verbatim (sync path) from src/lib/freshdesk.server.ts. Self-contained:
// per-user Freshdesk domain + personal API key, encrypted at rest.
import { Buffer } from "node:buffer";
import type { ExtractedDataset } from "./types.ts";
import { decryptConnectionKey } from "./crypto.ts";
import { getSupabaseAdmin } from "./client.ts";

async function admin() {
  return getSupabaseAdmin();
}

function freshdeskHost(domain: string): string {
  const d = domain.trim().toLowerCase().replace(/\.freshdesk\.com$/, "");
  return `https://${d}.freshdesk.com`;
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
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
  const { data, error } = await db.from("freshdesk_connections").select("*").eq("user_id", userId).maybeSingle();
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

const SUPPORT_HEADERS = ["customer_id", "email", "customer_name", "ticket_id", "created_date", "status", "category", "satisfaction_score"];

function mapFreshdeskStatus(status: unknown): string {
  const n = Number(status);
  if (n === 4 || n === 5) return "resolved";
  if (n === 2 || n === 3 || n === 6 || n === 7) return "open";
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
  name?: string | null;
  company_id?: number | null;
}
interface FreshdeskCsat {
  ticket_id?: number;
  ratings?: { default_question?: number };
}

async function fetchAllContactsById(domain: string, apiKey: string, ids: number[]): Promise<Map<number, { email: string; name: string }>> {
  const out = new Map<number, { email: string; name: string }>();
  const unique = [...new Set(ids)].slice(0, 100);
  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${freshdeskHost(domain)}/api/v2/contacts/${id}`, { headers: { Authorization: basicAuth(apiKey), Accept: "application/json" } });
        if (!res.ok) return;
        const c = (await res.json()) as FreshdeskContact;
        if (c.email || c.name) out.set(id, { email: c.email ?? "", name: c.name ?? "" });
      } catch { /* ignore individual contact errors */ }
    }),
  );
  return out;
}

export async function syncFreshdeskForUser(userId: string, limit: number, since: string | null): Promise<ExtractedDataset[]> {
  const conn = await loadFreshdeskConnection(userId);
  const cap = Math.min(limit, 100);
  const updatedSince = since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const url = `${freshdeskHost(conn.domain)}/api/v2/tickets?updated_since=${encodeURIComponent(updatedSince)}&per_page=${cap}&order_by=updated_at&order_type=desc`;
  const res = await fetch(url, { headers: { Authorization: basicAuth(conn.apiKey), Accept: "application/json" } });
  if (res.status === 429) throw new Error("Freshdesk rate limit hit — please try again in a moment.");
  const body = await res.text();
  if (!res.ok) throw new Error(`Freshdesk request failed [${res.status}]: ${body.slice(0, 300)}`);

  const tickets: FreshdeskTicket[] = body ? (JSON.parse(body) as FreshdeskTicket[]) : [];
  const sliced = tickets.slice(0, cap);
  if (!sliced.length) return [];

  const requesterIds = sliced.map((t) => t.requester_id).filter((x): x is number => typeof x === "number");
  const contactById = await fetchAllContactsById(conn.domain, conn.apiKey, requesterIds);

  const csatByTicket = new Map<number, number>();
  try {
    const csatRes = await fetch(
      `${freshdeskHost(conn.domain)}/api/v2/surveys/satisfaction_ratings?created_since=${encodeURIComponent(updatedSince)}`,
      { headers: { Authorization: basicAuth(conn.apiKey), Accept: "application/json" } },
    );
    if (csatRes.ok) {
      const ratings = (await csatRes.json()) as FreshdeskCsat[];
      for (const r of ratings) {
        if (r.ticket_id && r.ratings?.default_question != null) csatByTicket.set(r.ticket_id, r.ratings.default_question);
      }
    }
  } catch { /* CSAT is optional */ }

  const rows: string[][] = sliced.map((t) => {
    const contact = t.requester_id ? contactById.get(t.requester_id) : undefined;
    const rating = csatByTicket.get(t.id);
    return [
      toStr(t.requester_id), contact?.email ?? "", contact?.name ?? "", toStr(t.id),
      dateOnly(t.created_at), mapFreshdeskStatus(t.status), toStr(t.subject).slice(0, 60),
      rating != null ? String(rating) : "",
    ];
  });

  return [{ key: "support", label: "Support tickets", headers: SUPPORT_HEADERS, rows, confidence: 92, note: "Imported from Freshdesk tickets." }];
}
