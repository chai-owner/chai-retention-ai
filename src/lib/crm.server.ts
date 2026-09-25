import { laggedSinceMs } from "./sync-cursor";
// Server-only core for CRM syncs. Fetches accounts/companies + deals from
// Salesforce, HubSpot or Zoho CRM through the Lovable connector gateway, and
// supports delta pulls when a `since` timestamp is provided.
//
// Callable from both authenticated server functions (manual "Sync now") and
// the daily cron runner. Never import this file from client code.
import type { ExtractedDataset } from "./ingest.functions";
import { domainEmailHint } from "./crm-identity";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type CrmProvider = "salesforce" | "hubspot" | "zoho_crm";

// Per-user connections only. There are no workspace-level SALESFORCE_API_KEY /
// HUBSPOT_API_KEY / ZOHO_CRM_API_KEY env vars in this app: Salesforce and
// HubSpot use per-user App User Connector keys (app_user_connections) and Zoho
// uses its own per-user OAuth tokens (zoho_crm_connections).
export const CRM_PROVIDERS: { id: CrmProvider; name: string }[] = [
  { id: "salesforce", name: "Salesforce" },
  { id: "hubspot", name: "HubSpot" },
  { id: "zoho_crm", name: "Zoho CRM" },
];

function gatewayHeaders(connectionKey: string, lovableKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

function toStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
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

const CUSTOMER_HEADERS = [
  "customer_id",
  "name",
  "email",
  "signup_date",
  "monthly_revenue",
  "plan",
  "region",
];
const TRANSACTION_HEADERS = [
  "customer_id",
  "transaction_id",
  "amount",
  "transaction_date",
  "product",
  "currency",
];

const DEAL_TRANSACTION_HEADERS = [...TRANSACTION_HEADERS, "deal_stage", "deal_status"];

/**
 * Classifies a HubSpot deal as won / lost / open. Only won deals count as
 * sales in scoring (see countable-transactions.ts). HubSpot's own calculated
 * properties `hs_is_closed_won` / `hs_is_closed` work for every pipeline,
 * including custom ones whose stage ids are numeric; the default stage ids
 * `closedwon` / `closedlost` are the fallback when those are missing.
 */
export function hubspotDealStatus(p: Record<string, unknown>): "won" | "lost" | "open" {
  const flag = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const won = flag(p.hs_is_closed_won);
  const closed = flag(p.hs_is_closed);
  if (won === "true") return "won";
  if (closed === "true") return "lost";
  if (won === "false" && closed === "false") return "open";
  const stage = flag(p.dealstage);
  if (/closed[\s_-]*won/.test(stage)) return "won";
  if (/closed[\s_-]*lost/.test(stage)) return "lost";
  return "open";
}

function buildDatasets(
  customers: string[][],
  transactions: string[][],
  transactionHeaders: string[] = TRANSACTION_HEADERS,
): ExtractedDataset[] {
  const out: ExtractedDataset[] = [];
  if (customers.length) {
    out.push({
      key: "customers",
      label: "Customers",
      headers: CUSTOMER_HEADERS,
      rows: customers,
      confidence: 95,
      note: "Imported from CRM accounts / contacts.",
    });
  }
  if (transactions.length) {
    out.push({
      key: "transactions",
      label: "Transactions",
      headers: transactionHeaders,
      rows: transactions,
      confidence: 92,
      note: "Imported from CRM deals / opportunities.",
    });
  }
  return out;
}

async function gwGet(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (res.status === 429) throw new Error("CRM rate limit hit — please try again in a moment.");
  if (res.status === 204 || res.status === 304) return null;
  const body = await res.text();
  if (!res.ok) throw new Error(`CRM request failed [${res.status}]: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

// ---------------- Salesforce ----------------

async function syncSalesforce(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
  const { getConnectionKeyForUser } = await import("./app-user-connections.server");
  const connectionKey = await getConnectionKeyForUser(userId, "salesforce");
  if (!connectionKey) {
    throw new Error(
      "Salesforce isn't connected for your account. Connect it under Data → Connect your CRM first.",
    );
  }
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");

  const where = since ? ` WHERE SystemModstamp >= ${since}` : "";
  const accSoql = `SELECT Id, Name, Website, CreatedDate, AnnualRevenue, Type, BillingCountry FROM Account${where} ORDER BY SystemModstamp DESC LIMIT ${limit}`;
  const oppSoql = `SELECT Id, AccountId, Name, Amount, CloseDate, StageName FROM Opportunity${where} ORDER BY SystemModstamp DESC LIMIT ${limit}`;
  // Primary contact email per account — the strongest cross-platform match signal.
  const conSoql = `SELECT Id, AccountId, Email FROM Contact WHERE Email != null ORDER BY CreatedDate ASC LIMIT ${limit}`;

  async function soql(q: string) {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE,
      connectionAPIKey: connectionKey!,
      connectorId: "salesforce",
      path: "/query?q=" + encodeURIComponent(q),
    });
    if (res.status === 429) throw new Error("Salesforce rate limit hit — try again shortly.");
    const body = await res.text();
    if (!res.ok)
      throw new Error(`Salesforce request failed [${res.status}]: ${body.slice(0, 300)}`);
    return body ? JSON.parse(body) : null;
  }

  const [acc, opp, con] = await Promise.all([
    soql(accSoql),
    soql(oppSoql),
    soql(conSoql).catch(() => null),
  ]);

  const emailByAccount = new Map<string, string>();
  for (const c of (con?.records ?? []) as Record<string, unknown>[]) {
    const accId = toStr(c.AccountId);
    const email = toStr(c.Email);
    if (accId && email && !emailByAccount.has(accId)) emailByAccount.set(accId, email);
  }

  const customers: string[][] = (acc?.records ?? []).map((r: Record<string, unknown>) => [
    toStr(r.Id),
    toStr(r.Name),
    emailByAccount.get(toStr(r.Id)) ?? domainEmailHint(toStr(r.Website)),
    dateOnly(r.CreatedDate),
    num((r.AnnualRevenue as number) ? Number(r.AnnualRevenue) / 12 : ""),
    toStr(r.Type),
    toStr(r.BillingCountry),
  ]);
  const transactions: string[][] = (opp?.records ?? []).map((r: Record<string, unknown>) => [
    toStr(r.AccountId),
    toStr(r.Id),
    num(r.Amount),
    dateOnly(r.CloseDate),
    toStr(r.Name),
    "USD",
  ]);
  return buildDatasets(customers, transactions);
}

// ---------------- HubSpot ----------------

/** Safety stop: 500 pages × 100 = 50,000 records per object type. */
export const HUBSPOT_MAX_PAGES = 500;

/**
 * Walks a HubSpot object list via `paging.next.after` until exhausted (or the
 * safety stop). Replaces the old first-page-only fetch that silently capped
 * every portal at 100 companies and 100 deals.
 */
export async function pageHubspotList(
  base: string,
  headers: Record<string, string>,
  objectType: string,
  properties: string[],
  associations?: string,
  fetchPage: (url: string) => Promise<unknown> = (url) => gwGet(url, headers),
): Promise<Record<string, unknown>[]> {
  const { hubspotPaths } = await import("./hubspot-api");
  const out: Record<string, unknown>[] = [];
  let after: string | undefined;
  for (let page = 0; page < HUBSPOT_MAX_PAGES; page++) {
    const url =
      base +
      hubspotPaths.list(objectType, {
        limit: "100",
        properties: properties.join(","),
        associations,
        after,
      });
    const body = (await fetchPage(url)) as {
      results?: Record<string, unknown>[];
      paging?: { next?: { after?: string } };
    } | null;
    out.push(...(body?.results ?? []));
    after = body?.paging?.next?.after;
    if (!after) return out;
  }
  console.warn(`HubSpot ${objectType}: stopped at safety cap of ${HUBSPOT_MAX_PAGES} pages`);
  return out;
}

async function syncHubspot(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
  const { getConnectionKeyForUser } = await import("./app-user-connections.server");
  const connectionKey = await getConnectionKeyForUser(userId, "hubspot");
  if (!connectionKey) {
    throw new Error(
      "HubSpot isn't connected for your account. Connect it under Data → Connect your CRM first.",
    );
  }
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/hubspot`;
  const companyProps = ["name", "domain", "createdate", "annualrevenue", "industry", "country", "hs_lastmodifieddate"];
  const dealProps = ["dealname", "amount", "closedate", "pipeline", "dealstage", "hs_is_closed_won", "hs_is_closed", "hs_lastmodifieddate"];
  void limit; // HubSpot now pages the whole portal; `limit` only capped Salesforce/Zoho-style pulls.

  // Per-user tokens can't use HubSpot's search endpoint, so "changed since"
  // is applied in code over the full paged list (see hubspot-api.ts).
  const sinceMs = since ? laggedSinceMs(since) : null;
  const companiesList = await pageHubspotList(base, headers, "companies", companyProps);
  const dealsList = await pageHubspotList(base, headers, "deals", dealProps, "companies");
  const changed = (r: Record<string, unknown>) => {
    if (sinceMs == null) return true;
    const p = (r.properties ?? {}) as Record<string, unknown>;
    const t = Date.parse(toStr(p.hs_lastmodifieddate) || toStr(r.updatedAt));
    return isNaN(t) || t >= sinceMs;
  };
  const companies = { results: companiesList.filter(changed) };
  // Deals stored before stage tracking have no status. The delta filter would
  // never revisit unchanged deals, so re-send every deal once until all stored
  // HubSpot deals carry a status (same approach as Zoho).
  let fullDeals = false;
  if (sinceMs != null) {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: legacy } = await supabaseAdmin
      .from("ingested_transactions")
      .select("id, batch:ingest_batches!inner(source_provider)")
      .eq("user_id", userId)
      .eq("batch.source_provider", "hubspot")
      .is("data->>deal_status", null)
      .limit(1);
    fullDeals = (legacy?.length ?? 0) > 0;
  }
  const deals = { results: fullDeals ? dealsList : dealsList.filter(changed) };

  const customers: string[][] = (
    (companies as { results?: Record<string, unknown>[] } | null)?.results ?? []
  ).map((r) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    return [
      toStr(r.id),
      toStr(p.name),
      domainEmailHint(toStr(p.domain)),
      dateOnly(p.createdate),
      num((p.annualrevenue as string) ? Number(p.annualrevenue) / 12 : ""),
      toStr(p.industry),
      toStr(p.country),
    ];
  });
  const transactions: string[][] = (
    (deals as { results?: Record<string, unknown>[] } | null)?.results ?? []
  ).map((r) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    const assoc = r.associations as { companies?: { results?: { id: string }[] } } | undefined;
    const companyId = assoc?.companies?.results?.[0]?.id ?? "";
    return [
      toStr(companyId),
      toStr(r.id),
      num(p.amount),
      dateOnly(p.closedate),
      toStr(p.dealname),
      "USD",
      toStr(p.dealstage),
      hubspotDealStatus(p),
    ];
  });
  return buildDatasets(customers, transactions, DEAL_TRANSACTION_HEADERS);
}

// ---------------- Zoho CRM (per-user OAuth) ----------------

async function syncZoho(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const { syncZohoForUser } = await import("./zoho.server");
  return syncZohoForUser(userId, limit, since);
}

// ---------------- Public entry points ----------------

async function admin() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin = await getSupabaseAdmin();
  return supabaseAdmin;
}

export async function getCrmSince(userId: string, provider: CrmProvider): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("crm_sync_state")
    .select("last_synced_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data?.last_synced_at as string | null) ?? null;
}

export async function markCrmSynced(
  userId: string,
  provider: CrmProvider,
  when: string,
): Promise<void> {
  const db = await admin();
  await db
    .from("crm_sync_state")
    .upsert(
      { user_id: userId, provider, last_synced_at: when },
      { onConflict: "user_id,provider" },
    );
}

export async function runCrmSync(
  provider: CrmProvider,
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  switch (provider) {
    case "salesforce":
      return syncSalesforce(userId, limit, since);
    case "hubspot":
      return syncHubspot(userId, limit, since);
    case "zoho_crm":
      return syncZoho(userId, limit, since);
    default:
      throw new Error("Unsupported CRM provider");
  }
}

// Called right after a successful connect so the daily cron can discover the
// integration before the user ever runs a manual sync. `last_synced_at` stays
// null so the first run does a full backfill.
export async function ensureCrmSyncState(userId: string, provider: CrmProvider): Promise<void> {
  const db = await admin();
  const { data } = await db
    .from("crm_sync_state")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (data) return;
  const { error } = await db
    .from("crm_sync_state")
    .insert({ user_id: userId, provider, last_synced_at: null });
  if (error) console.error(`Failed to seed crm_sync_state for ${provider}: ${error.message}`);
}

export async function clearCrmSyncState(userId: string, provider: CrmProvider): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("crm_sync_state")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) console.error(`Failed to clear crm_sync_state for ${provider}: ${error.message}`);
}
