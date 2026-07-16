// Server-only core for CRM syncs. Fetches accounts/companies + deals from
// Salesforce, HubSpot or Zoho CRM through the Lovable connector gateway, and
// supports delta pulls when a `since` timestamp is provided.
//
// Callable from both authenticated server functions (manual "Sync now") and
// the daily cron runner. Never import this file from client code.
import type { ExtractedDataset } from "./ingest.functions";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type CrmProvider = "salesforce" | "hubspot" | "zoho_crm";

export const CRM_PROVIDERS: { id: CrmProvider; name: string; keyEnv: string }[] = [
  { id: "salesforce", name: "Salesforce", keyEnv: "SALESFORCE_API_KEY" },
  { id: "hubspot", name: "HubSpot", keyEnv: "HUBSPOT_API_KEY" },
  { id: "zoho_crm", name: "Zoho CRM", keyEnv: "ZOHO_CRM_API_KEY" },
];

function credsFor(provider: CrmProvider) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const meta = CRM_PROVIDERS.find((p) => p.id === provider)!;
  const connectionKey = process.env[meta.keyEnv];
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
  if (!connectionKey) {
    throw new Error(
      `${meta.name} is not connected yet. Connect it under Data → Connect your CRM first.`,
    );
  }
  return { lovableKey, connectionKey, name: meta.name };
}

function credsForUser(lovableKey: string, connectionKey: string) {
  return { lovableKey, connectionKey };
}


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
  "customer_id", "name", "email", "signup_date",
  "monthly_revenue", "plan", "region",
];
const TRANSACTION_HEADERS = [
  "customer_id", "transaction_id", "amount",
  "transaction_date", "product", "currency",
];

function buildDatasets(customers: string[][], transactions: string[][]): ExtractedDataset[] {
  const out: ExtractedDataset[] = [];
  if (customers.length) {
    out.push({
      key: "customers", label: "Customers", headers: CUSTOMER_HEADERS,
      rows: customers, confidence: 95,
      note: "Imported from CRM accounts / contacts.",
    });
  }
  if (transactions.length) {
    out.push({
      key: "transactions", label: "Transactions", headers: TRANSACTION_HEADERS,
      rows: transactions, confidence: 92,
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
async function gwPost(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 429) throw new Error("CRM rate limit hit — please try again in a moment.");
  const text = await res.text();
  if (!res.ok) throw new Error(`CRM request failed [${res.status}]: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
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
  const accSoql = `SELECT Id, Name, CreatedDate, AnnualRevenue, Type, BillingCountry FROM Account${where} ORDER BY SystemModstamp DESC LIMIT ${limit}`;
  const oppSoql = `SELECT Id, AccountId, Name, Amount, CloseDate, StageName FROM Opportunity${where} ORDER BY SystemModstamp DESC LIMIT ${limit}`;

  async function soql(q: string) {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE,
      connectionAPIKey: connectionKey!,
      connectorId: "salesforce",
      path: "/query?q=" + encodeURIComponent(q),
    });
    if (res.status === 429) throw new Error("Salesforce rate limit hit — try again shortly.");
    const body = await res.text();
    if (!res.ok) throw new Error(`Salesforce request failed [${res.status}]: ${body.slice(0, 300)}`);
    return body ? JSON.parse(body) : null;
  }

  const [acc, opp] = await Promise.all([soql(accSoql), soql(oppSoql)]);

  const customers: string[][] = (acc?.records ?? []).map((r: Record<string, unknown>) => [
    toStr(r.Id), toStr(r.Name), "", dateOnly(r.CreatedDate),
    num((r.AnnualRevenue as number) ? Number(r.AnnualRevenue) / 12 : ""),
    toStr(r.Type), toStr(r.BillingCountry),
  ]);
  const transactions: string[][] = (opp?.records ?? []).map((r: Record<string, unknown>) => [
    toStr(r.AccountId), toStr(r.Id), num(r.Amount),
    dateOnly(r.CloseDate), toStr(r.Name), "USD",
  ]);
  return buildDatasets(customers, transactions);
}


// ---------------- HubSpot ----------------

async function syncHubspot(limit: number, since: string | null): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("hubspot");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/hubspot`;
  const cap = Math.min(limit, 100);
  const companyProps = ["name", "createdate", "annualrevenue", "industry", "country"];
  const dealProps = ["dealname", "amount", "closedate", "pipeline", "dealstage"];

  let companies: unknown, deals: unknown;

  if (since) {
    // Delta pulls use the Search API which supports filters.
    const sinceMs = new Date(since).getTime();
    const searchBody = (properties: string[]) => ({
      filterGroups: [{
        filters: [{ propertyName: "hs_lastmodifieddate", operator: "GTE", value: String(sinceMs) }],
      }],
      properties,
      limit: cap,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    });
    [companies, deals] = await Promise.all([
      gwPost(`${base}/crm/v3/objects/companies/search`, headers, searchBody(companyProps)),
      gwPost(`${base}/crm/v3/objects/deals/search`, headers, {
        ...searchBody(dealProps),
        associations: ["companies"],
      }),
    ]);
  } else {
    [companies, deals] = await Promise.all([
      gwGet(`${base}/crm/v3/objects/companies?limit=${cap}&properties=${companyProps.join(",")}`, headers),
      gwGet(`${base}/crm/v3/objects/deals?limit=${cap}&properties=${dealProps.join(",")}&associations=companies`, headers),
    ]);
  }

  const customers: string[][] = ((companies as { results?: Record<string, unknown>[] } | null)?.results ?? []).map((r) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    return [
      toStr(r.id), toStr(p.name), "", dateOnly(p.createdate),
      num((p.annualrevenue as string) ? Number(p.annualrevenue) / 12 : ""),
      toStr(p.industry), toStr(p.country),
    ];
  });
  const transactions: string[][] = ((deals as { results?: Record<string, unknown>[] } | null)?.results ?? []).map((r) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    const assoc = r.associations as { companies?: { results?: { id: string }[] } } | undefined;
    const companyId = assoc?.companies?.results?.[0]?.id ?? "";
    return [toStr(companyId), toStr(r.id), num(p.amount), dateOnly(p.closedate), toStr(p.dealname), "USD"];
  });
  return buildDatasets(customers, transactions);
}

// ---------------- Zoho CRM ----------------

async function syncZoho(limit: number, since: string | null): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("zoho_crm");
  const headers: Record<string, string> = gatewayHeaders(connectionKey, lovableKey);
  if (since) headers["If-Modified-Since"] = new Date(since).toUTCString();
  const base = `${GATEWAY_BASE}/zoho_crm`;
  const cap = Math.min(limit, 200);
  const accFields = "Account_Name,Created_Time,Annual_Revenue,Industry,Billing_Country";
  const dealFields = "Deal_Name,Account_Name,Amount,Closing_Date,Stage";

  const [acc, deals] = await Promise.all([
    gwGet(`${base}/Accounts?fields=${encodeURIComponent(accFields)}&per_page=${cap}`, headers),
    gwGet(`${base}/Deals?fields=${encodeURIComponent(dealFields)}&per_page=${cap}`, headers),
  ]);

  const customers: string[][] = (acc?.data ?? []).map((r: Record<string, unknown>) => [
    toStr(r.id), toStr(r.Account_Name), "", dateOnly(r.Created_Time),
    num((r.Annual_Revenue as number) ? Number(r.Annual_Revenue) / 12 : ""),
    toStr(r.Industry), toStr(r.Billing_Country),
  ]);
  const transactions: string[][] = (deals?.data ?? []).map((r: Record<string, unknown>) => {
    const account = r.Account_Name as { id?: string } | string | undefined;
    const accountId = typeof account === "object" && account ? toStr(account.id) : "";
    return [accountId, toStr(r.id), num(r.Amount), dateOnly(r.Closing_Date), toStr(r.Deal_Name), "USD"];
  });
  return buildDatasets(customers, transactions);
}

// ---------------- Public entry points ----------------

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

export async function markCrmSynced(userId: string, provider: CrmProvider, when: string): Promise<void> {
  const db = await admin();
  await db.from("crm_sync_state").upsert(
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
    case "salesforce": return syncSalesforce(userId, limit, since);
    case "hubspot": return syncHubspot(limit, since);
    case "zoho_crm": return syncZoho(limit, since);
    default: throw new Error("Unsupported CRM provider");
  }
}
