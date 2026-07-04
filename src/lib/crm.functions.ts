import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedDataset } from "./ingest.functions";

// ---------------------------------------------------------------------------
// CRM ingestion — pulls real records from Salesforce / HubSpot / Zoho CRM
// through the Lovable connector gateway and normalizes them into ChAi's
// dataset shape (the same `ExtractedDataset` used by document ingestion), so
// the existing review-and-import UI can reuse everything downstream.
//
// Path A (single workspace account): the gateway keys are injected once the
// connector is linked. Until then, each provider fn throws a clear error that
// the UI surfaces as "connect this CRM first".
// ---------------------------------------------------------------------------

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type CrmProvider = "salesforce" | "hubspot" | "zoho_crm";

export const CRM_PROVIDERS: { id: CrmProvider; name: string; keyEnv: string }[] = [
  { id: "salesforce", name: "Salesforce", keyEnv: "SALESFORCE_API_KEY" },
  { id: "hubspot", name: "HubSpot", keyEnv: "HUBSPOT_API_KEY" },
  { id: "zoho_crm", name: "Zoho CRM", keyEnv: "ZOHO_CRM_API_KEY" },
];

export interface CrmSyncResult {
  provider: CrmProvider;
  providerName: string;
  datasets: ExtractedDataset[];
}

const SyncInput = z.object({
  provider: z.enum(["salesforce", "hubspot", "zoho_crm"]),
  // Soft cap on how many accounts / deals to pull in one sync.
  limit: z.number().int().min(1).max(500).optional().default(200),
});

// --- helpers ---------------------------------------------------------------

function gatewayHeaders(connectionKey: string, lovableKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

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

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
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

function buildDatasets(
  customers: string[][],
  transactions: string[][],
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
      headers: TRANSACTION_HEADERS,
      rows: transactions,
      confidence: 92,
      note: "Imported from CRM deals / opportunities.",
    });
  }
  return out;
}

async function gwGet(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (res.status === 429) {
    throw new Error("CRM rate limit hit — please try again in a moment.");
  }
  if (res.status === 204) return null;
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`CRM request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

// --- Salesforce ------------------------------------------------------------

async function syncSalesforce(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("salesforce");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/salesforce`;

  const accSoql = `SELECT Id, Name, CreatedDate, AnnualRevenue, Type, BillingCountry FROM Account ORDER BY CreatedDate DESC LIMIT ${limit}`;
  const oppSoql = `SELECT Id, AccountId, Name, Amount, CloseDate, StageName FROM Opportunity ORDER BY CloseDate DESC LIMIT ${limit}`;

  const [acc, opp] = await Promise.all([
    gwGet(`${base}/query?q=${encodeURIComponent(accSoql)}`, headers),
    gwGet(`${base}/query?q=${encodeURIComponent(oppSoql)}`, headers),
  ]);

  const customers: string[][] = (acc?.records ?? []).map((r: Record<string, unknown>) => [
    toStr(r.Id),
    toStr(r.Name),
    "",
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

// --- HubSpot ---------------------------------------------------------------

async function syncHubspot(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("hubspot");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/hubspot`;
  const cap = Math.min(limit, 100); // HubSpot page size max

  const companyProps = "name,createdate,annualrevenue,industry,country";
  const dealProps = "dealname,amount,closedate,pipeline,dealstage";

  const [companies, deals] = await Promise.all([
    gwGet(`${base}/crm/v3/objects/companies?limit=${cap}&properties=${companyProps}`, headers),
    gwGet(`${base}/crm/v3/objects/deals?limit=${cap}&properties=${dealProps}&associations=companies`, headers),
  ]);

  const customers: string[][] = (companies?.results ?? []).map((r: Record<string, unknown>) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    return [
      toStr(r.id),
      toStr(p.name),
      "",
      dateOnly(p.createdate),
      num((p.annualrevenue as string) ? Number(p.annualrevenue) / 12 : ""),
      toStr(p.industry),
      toStr(p.country),
    ];
  });

  const transactions: string[][] = (deals?.results ?? []).map((r: Record<string, unknown>) => {
    const p = (r.properties ?? {}) as Record<string, unknown>;
    const assoc = r.associations as
      | { companies?: { results?: { id: string }[] } }
      | undefined;
    const companyId = assoc?.companies?.results?.[0]?.id ?? "";
    return [
      toStr(companyId),
      toStr(r.id),
      num(p.amount),
      dateOnly(p.closedate),
      toStr(p.dealname),
      "USD",
    ];
  });

  return buildDatasets(customers, transactions);
}

// --- Zoho CRM --------------------------------------------------------------

async function syncZoho(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("zoho_crm");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/zoho_crm`;
  const cap = Math.min(limit, 200); // Zoho per_page max

  const accFields = "Account_Name,Created_Time,Annual_Revenue,Industry,Billing_Country";
  const dealFields = "Deal_Name,Account_Name,Amount,Closing_Date,Stage";

  const [acc, deals] = await Promise.all([
    gwGet(`${base}/Accounts?fields=${encodeURIComponent(accFields)}&per_page=${cap}`, headers),
    gwGet(`${base}/Deals?fields=${encodeURIComponent(dealFields)}&per_page=${cap}`, headers),
  ]);

  const customers: string[][] = (acc?.data ?? []).map((r: Record<string, unknown>) => [
    toStr(r.id),
    toStr(r.Account_Name),
    "",
    dateOnly(r.Created_Time),
    num((r.Annual_Revenue as number) ? Number(r.Annual_Revenue) / 12 : ""),
    toStr(r.Industry),
    toStr(r.Billing_Country),
  ]);

  const transactions: string[][] = (deals?.data ?? []).map((r: Record<string, unknown>) => {
    const account = r.Account_Name as { id?: string } | string | undefined;
    const accountId = typeof account === "object" && account ? toStr(account.id) : "";
    return [
      accountId,
      toStr(r.id),
      num(r.Amount),
      dateOnly(r.Closing_Date),
      toStr(r.Deal_Name),
      "USD",
    ];
  });

  return buildDatasets(customers, transactions);
}

// --- server function -------------------------------------------------------

export const syncCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data }): Promise<CrmSyncResult> => {
    const provider = data.provider as CrmProvider;
    const name = CRM_PROVIDERS.find((p) => p.id === provider)!.name;

    let datasets: ExtractedDataset[];
    switch (provider) {
      case "salesforce":
        datasets = await syncSalesforce(data.limit);
        break;
      case "hubspot":
        datasets = await syncHubspot(data.limit);
        break;
      case "zoho_crm":
        datasets = await syncZoho(data.limit);
        break;
      default:
        throw new Error("Unsupported CRM provider");
    }

    return { provider, providerName: name, datasets };
  });
