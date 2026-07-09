import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedDataset } from "./ingest.functions";

// ---------------------------------------------------------------------------
// Accounting ingestion — pulls real records from QuickBooks Online, Xero and
// FreshBooks through the Lovable connector gateway and normalizes them into
// ChAi's dataset shape (the same `ExtractedDataset` used by document ingestion
// and CRM sync), so the existing review-and-import UI can reuse everything
// downstream.
//
// Accounting systems are the source of truth for what customers actually buy
// and how often, so they feed ChAi's customer list (who they are + total
// spend) and transactions (each invoice / payment) — giving a much richer
// picture of buying habits, cadence and value than manual uploads.
//
// Until a connector is linked, each provider fn throws a clear error that the
// UI surfaces as "connect this accounting tool first".
// ---------------------------------------------------------------------------

const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type AccountingProvider = "quickbooks" | "xero" | "freshbooks";

export const ACCOUNTING_PROVIDERS: {
  id: AccountingProvider;
  name: string;
  keyEnv: string;
}[] = [
  { id: "quickbooks", name: "QuickBooks Online", keyEnv: "QUICKBOOKS_API_KEY" },
  { id: "xero", name: "Xero", keyEnv: "XERO_API_KEY" },
  { id: "freshbooks", name: "FreshBooks", keyEnv: "FRESHBOOKS_API_KEY" },
];

export interface AccountingSyncResult {
  provider: AccountingProvider;
  providerName: string;
  datasets: ExtractedDataset[];
}

const SyncInput = z.object({
  provider: z.enum(["quickbooks", "xero", "freshbooks"]),
  // Soft cap on how many customers / invoices to pull in one sync.
  limit: z.number().int().min(1).max(500).optional().default(200),
});

// --- helpers ---------------------------------------------------------------

function gatewayHeaders(connectionKey: string, lovableKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function credsFor(provider: AccountingProvider) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const meta = ACCOUNTING_PROVIDERS.find((p) => p.id === provider)!;
  const connectionKey = process.env[meta.keyEnv];
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
  if (!connectionKey) {
    throw new Error(
      `${meta.name} is not connected yet. Connect it under Data → Connect your accounting tools first.`,
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
      confidence: 94,
      note: "Imported from accounting customers.",
    });
  }
  if (transactions.length) {
    out.push({
      key: "transactions",
      label: "Transactions",
      headers: TRANSACTION_HEADERS,
      rows: transactions,
      confidence: 96,
      note: "Imported from accounting invoices / payments.",
    });
  }
  return out;
}

async function gwGet(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (res.status === 429) {
    throw new Error("Accounting API rate limit hit — please try again in a moment.");
  }
  if (res.status === 204) return null;
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Accounting request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

// --- QuickBooks Online -----------------------------------------------------

async function syncQuickBooks(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("quickbooks");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/quickbooks`;

  const custQuery = `SELECT * FROM Customer MAXRESULTS ${limit}`;
  const invQuery = `SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS ${limit}`;

  const [cust, inv] = await Promise.all([
    gwGet(`${base}/v3/company/query?query=${encodeURIComponent(custQuery)}`, headers),
    gwGet(`${base}/v3/company/query?query=${encodeURIComponent(invQuery)}`, headers),
  ]);

  const customers: string[][] = (cust?.QueryResponse?.Customer ?? []).map(
    (r: Record<string, unknown>) => [
      toStr(r.Id),
      toStr(r.DisplayName ?? r.CompanyName),
      toStr((r.PrimaryEmailAddr as { Address?: string } | undefined)?.Address),
      dateOnly((r.MetaData as { CreateTime?: string } | undefined)?.CreateTime),
      num(r.Balance),
      "",
      toStr((r.BillAddr as { CountrySubDivisionCode?: string } | undefined)?.CountrySubDivisionCode),
    ],
  );

  const transactions: string[][] = (inv?.QueryResponse?.Invoice ?? []).map(
    (r: Record<string, unknown>) => [
      toStr((r.CustomerRef as { value?: string } | undefined)?.value),
      toStr(r.Id),
      num(r.TotalAmt),
      dateOnly(r.TxnDate),
      toStr(r.DocNumber ?? "Invoice"),
      toStr(r.CurrencyRef ? (r.CurrencyRef as { value?: string }).value : "USD") || "USD",
    ],
  );

  return buildDatasets(customers, transactions);
}

// --- Xero ------------------------------------------------------------------

async function syncXero(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("xero");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/xero`;

  const [contacts, invoices] = await Promise.all([
    gwGet(`${base}/api.xro/2.0/Contacts?page=1`, headers),
    gwGet(`${base}/api.xro/2.0/Invoices?page=1&where=Type=="ACCREC"`, headers),
  ]);

  const customers: string[][] = (contacts?.Contacts ?? [])
    .slice(0, limit)
    .map((r: Record<string, unknown>) => [
      toStr(r.ContactID),
      toStr(r.Name),
      toStr(r.EmailAddress),
      dateOnly(r.UpdatedDateUTC),
      "",
      "",
      toStr(
        (
          (r.Addresses as { Country?: string }[] | undefined)?.[0] ?? {}
        ).Country,
      ),
    ]);

  const transactions: string[][] = (invoices?.Invoices ?? [])
    .slice(0, limit)
    .map((r: Record<string, unknown>) => [
      toStr((r.Contact as { ContactID?: string } | undefined)?.ContactID),
      toStr(r.InvoiceID ?? r.InvoiceNumber),
      num(r.Total),
      dateOnly(r.DateString ?? r.Date),
      toStr(r.Reference ?? r.InvoiceNumber ?? "Invoice"),
      toStr(r.CurrencyCode) || "USD",
    ]);

  return buildDatasets(customers, transactions);
}

// --- FreshBooks ------------------------------------------------------------

async function syncFreshbooks(limit: number): Promise<ExtractedDataset[]> {
  const { lovableKey, connectionKey } = credsFor("freshbooks");
  const headers = gatewayHeaders(connectionKey, lovableKey);
  const base = `${GATEWAY_BASE}/freshbooks`;
  const cap = Math.min(limit, 100); // FreshBooks page size

  // FreshBooks scopes data by account; the gateway resolves the account id.
  const [clients, invoices] = await Promise.all([
    gwGet(`${base}/accounting/account/clients/clients?per_page=${cap}`, headers),
    gwGet(`${base}/accounting/account/invoices/invoices?per_page=${cap}`, headers),
  ]);

  const customers: string[][] = (clients?.response?.result?.clients ?? []).map(
    (r: Record<string, unknown>) => [
      toStr(r.id),
      toStr(r.organization) || `${toStr(r.fname)} ${toStr(r.lname)}`.trim(),
      toStr(r.email),
      dateOnly(r.signup_date),
      "",
      "",
      toStr(r.p_country),
    ],
  );

  const transactions: string[][] = (invoices?.response?.result?.invoices ?? []).map(
    (r: Record<string, unknown>) => [
      toStr(r.customerid),
      toStr(r.id ?? r.invoice_number),
      num((r.amount as { amount?: string } | undefined)?.amount ?? r.amount),
      dateOnly(r.create_date),
      toStr(r.invoice_number ?? "Invoice"),
      toStr((r.amount as { code?: string } | undefined)?.code) || "USD",
    ],
  );

  return buildDatasets(customers, transactions);
}

// --- server function -------------------------------------------------------

export const syncAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data }): Promise<AccountingSyncResult> => {
    const provider = data.provider as AccountingProvider;
    const name = ACCOUNTING_PROVIDERS.find((p) => p.id === provider)!.name;

    let datasets: ExtractedDataset[];
    switch (provider) {
      case "quickbooks":
        datasets = await syncQuickBooks(data.limit);
        break;
      case "xero":
        datasets = await syncXero(data.limit);
        break;
      case "freshbooks":
        datasets = await syncFreshbooks(data.limit);
        break;
      default:
        throw new Error("Unsupported accounting provider");
    }

    return { provider, providerName: name, datasets };
  });
