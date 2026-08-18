// Server-only helpers for real accounting OAuth integrations
// (QuickBooks Online, Xero, FreshBooks).
//
// This file talks to the providers directly using the customer's own developer
// app credentials (client id / secret stored as project secrets) and reads /
// writes OAuth tokens via the service-role Supabase client. It must only ever
// be imported from server code (server functions / server routes).
import type { ExtractedDataset } from "./ingest.functions";
import {
  encryptSecret,
  decryptSecret,
  decryptSecretOrNull,
} from "./connection-key-crypto.server";

export type AccountingProvider = "quickbooks" | "xero" | "freshbooks";

export const ACCOUNTING_PROVIDERS: { id: AccountingProvider; name: string }[] = [
  { id: "quickbooks", name: "QuickBooks Online" },
  { id: "xero", name: "Xero" },
  { id: "freshbooks", name: "FreshBooks" },
];

export function providerName(p: AccountingProvider): string {
  return ACCOUNTING_PROVIDERS.find((x) => x.id === p)?.name ?? p;
}

// ---- Credentials ---------------------------------------------------------

interface Creds {
  clientId: string;
  clientSecret: string;
}

export function getCreds(provider: AccountingProvider): Creds {
  const map: Record<AccountingProvider, [string, string]> = {
    quickbooks: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    xero: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
    freshbooks: ["FRESHBOOKS_CLIENT_ID", "FRESHBOOKS_CLIENT_SECRET"],
  };
  const [idKey, secretKey] = map[provider];
  const clientId = process.env[idKey];
  const clientSecret = process.env[secretKey];
  if (!clientId || !clientSecret) {
    throw new Error(
      `${providerName(provider)} is not configured. Missing ${idKey}/${secretKey}.`,
    );
  }
  return { clientId, clientSecret };
}

export function hasCreds(provider: AccountingProvider): boolean {
  try {
    getCreds(provider);
    return true;
  } catch {
    return false;
  }
}

// ---- OAuth config --------------------------------------------------------

function qboApiBase(): string {
  return process.env.QUICKBOOKS_ENVIRONMENT === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export function buildAuthorizeUrl(
  provider: AccountingProvider,
  redirectUri: string,
  state: string,
): string {
  const { clientId } = getCreds(provider);
  if (provider === "quickbooks") {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: redirectUri,
      state,
    });
    return `https://appcenter.intuit.com/connect/oauth2?${p}`;
  }
  if (provider === "xero") {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope:
        "openid profile email accounting.contacts.read accounting.transactions.read offline_access",
      redirect_uri: redirectUri,
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${p}`;
  }
  // freshbooks
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `https://auth.freshbooks.com/oauth/authorize?${p}`;
}

// ---- Token exchange ------------------------------------------------------

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
}

function expiryFrom(expiresInSec?: number): string | undefined {
  if (!expiresInSec) return undefined;
  // Refresh a minute early to be safe.
  return new Date(Date.now() + (expiresInSec - 60) * 1000).toISOString();
}

function basicAuth({ clientId, clientSecret }: Creds): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function exchangeCode(
  provider: AccountingProvider,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const creds = getCreds(provider);
  if (provider === "quickbooks") {
    const res = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(creds),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      },
    );
    const j = await readJson(res, "QuickBooks token exchange");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: expiryFrom(j.expires_in),
    };
  }
  if (provider === "xero") {
    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: basicAuth(creds),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const j = await readJson(res, "Xero token exchange");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: expiryFrom(j.expires_in),
    };
  }
  // freshbooks
  const res = await fetch("https://api.freshbooks.com/auth/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const j = await readJson(res, "FreshBooks token exchange");
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: expiryFrom(j.expires_in),
  };
}

async function refreshTokens(
  provider: AccountingProvider,
  refreshToken: string,
): Promise<TokenSet> {
  const creds = getCreds(provider);
  if (provider === "quickbooks") {
    const res = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(creds),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    const j = await readJson(res, "QuickBooks token refresh");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? refreshToken,
      expiresAt: expiryFrom(j.expires_in),
    };
  }
  if (provider === "xero") {
    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: basicAuth(creds),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const j = await readJson(res, "Xero token refresh");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? refreshToken,
      expiresAt: expiryFrom(j.expires_in),
    };
  }
  const res = await fetch("https://api.freshbooks.com/auth/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const j = await readJson(res, "FreshBooks token refresh");
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: expiryFrom(j.expires_in),
  };
}

async function readJson(res: Response, ctx: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`${ctx} failed [${res.status}]: ${text}`);
    throw new Error(`${ctx} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${ctx}: could not parse response`);
  }
}

// ---- Post-connect account discovery -------------------------------------

// After token exchange, resolve the org/company identifiers each provider
// needs for API calls. `realmId` for QBO comes straight from the callback URL.
export interface XeroTenant {
  tenantId: string;
  tenantName: string;
}

export interface AccountInfo {
  realmId?: string;
  tenantId?: string;
  tenants?: XeroTenant[];
  accountId?: string;
  companyName?: string;
}

export async function resolveAccountInfo(
  provider: AccountingProvider,
  tokens: TokenSet,
  realmIdFromCallback?: string,
): Promise<AccountInfo> {
  if (provider === "quickbooks") {
    if (!realmIdFromCallback) {
      throw new Error(
        "QuickBooks did not return a company (realm) id. Please retry the connection from the Data page.",
      );
    }
    let companyName: string | undefined;
    try {
      const res = await fetch(
        `${qboApiBase()}/v3/company/${realmIdFromCallback}/companyinfo/${realmIdFromCallback}?minorversion=65`,
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        const j = await res.json();
        companyName = j?.CompanyInfo?.CompanyName;
      }
    } catch {
      /* best-effort company name */
    }
    return { realmId: realmIdFromCallback, companyName };
  }
  if (provider === "xero") {
    const res = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/json",
      },
    });
    const conns = await readJson(res, "Xero connections");
    const tenants: XeroTenant[] = (Array.isArray(conns) ? conns : [])
      .filter((c: any) => c?.tenantId)
      .map((c: any) => ({
        tenantId: String(c.tenantId),
        tenantName: String(c.tenantName ?? c.tenantId),
      }));
    if (!tenants.length) {
      throw new Error(
        "Xero authorised the app but returned no organisations. Grant access to at least one organisation and try again.",
      );
    }
    // With one organisation we pin it immediately. With several we leave the
    // selection empty: every organisation is synced until the user picks one.
    return {
      tenants,
      tenantId: tenants.length === 1 ? tenants[0].tenantId : undefined,
      companyName:
        tenants.length === 1
          ? tenants[0].tenantName
          : `${tenants.length} organisations`,
    };
  }
  // freshbooks — the account/business id is required for every later API call,
  // so a connection we can't resolve one for is not usable and must not save.
  const res = await fetch("https://api.freshbooks.com/auth/api/v1/users/me", {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
    },
  });
  const j = await readJson(res, "FreshBooks identity");
  const memberships: any[] = [
    ...(Array.isArray(j?.response?.business_memberships)
      ? j.response.business_memberships
      : []),
    ...(Array.isArray(j?.response?.roles) ? j.response.roles : []),
  ];
  let accountId: string | undefined;
  let companyName: string | undefined;
  for (const m of memberships) {
    const id =
      m?.business?.account_id ?? m?.accountid ?? m?.account_id ?? m?.business?.id;
    if (id) {
      accountId = String(id);
      companyName = m?.business?.name ?? undefined;
      break;
    }
  }
  if (!accountId) {
    console.error(
      "FreshBooks identity returned no usable account id",
      JSON.stringify(Object.keys(j?.response ?? {})),
    );
    throw new Error(
      "FreshBooks didn't return an account for this login. Make sure the user is a member of at least one FreshBooks business, then connect again.",
    );
  }
  return { accountId, companyName };
}

// ---- Connection persistence ---------------------------------------------

export interface ConnectionRow {
  provider: AccountingProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  realm_id: string | null;
  tenant_id: string | null;
  account_id: string | null;
  company_name: string | null;
  connected_at: string;
  tenants?: XeroTenant[] | null;
  last_synced_at?: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveConnection(
  userId: string,
  provider: AccountingProvider,
  tokens: TokenSet,
  info: AccountInfo,
): Promise<void> {
  const db = await admin();
  const { error } = await db.from("accounting_connections").upsert(
    {
      user_id: userId,
      provider,
      access_token: encryptSecret(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt ?? null,
      realm_id: info.realmId ?? null,
      tenant_id: info.tenantId ?? null,
      account_id: info.accountId ?? null,
      tenants: info.tenants ?? [],
      company_name: info.companyName ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Failed to save connection: ${error.message}`);
}

// Loads a connection and refreshes its access token if expired.
async function loadFreshConnection(
  userId: string,
  provider: AccountingProvider,
): Promise<ConnectionRow> {
  const db = await admin();
  const { data, error } = await db
    .from("accounting_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${providerName(provider)} is not connected.`);

  const row = data as ConnectionRow & { id: string };
  // Rows written before token-at-rest encryption are still plaintext.
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);
  const expired =
    row.expires_at != null && new Date(row.expires_at).getTime() < Date.now();
  if (expired && row.refresh_token) {
    const refreshed = await refreshTokens(provider, row.refresh_token);
    await db
      .from("accounting_connections")
      .update({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: encryptSecret(refreshed.refreshToken ?? row.refresh_token),
        expires_at: refreshed.expiresAt ?? null,
      })
      .eq("id", row.id);
    row.access_token = refreshed.accessToken;
    row.refresh_token = refreshed.refreshToken ?? row.refresh_token;
    row.expires_at = refreshed.expiresAt ?? null;
  }
  return row;
}

// ---- Data fetch + normalization -----------------------------------------

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

function isoDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export async function fetchAndNormalize(
  userId: string,
  provider: AccountingProvider,
  sinceOverride?: string | null,
): Promise<ExtractedDataset[]> {
  const conn = await loadFreshConnection(userId, provider);
  const auth = { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" };
  // Prefer explicit override (used by the daily cron); otherwise fall back to
  // the connection's own last_synced_at so manual "Sync now" is also delta.
  const since =
    sinceOverride === undefined
      ? ((conn as unknown as { last_synced_at?: string | null }).last_synced_at ?? null)
      : sinceOverride;
  const startedAt = new Date().toISOString();

  const customerRows: string[][] = [];
  const txnRows: string[][] = [];

  if (provider === "quickbooks") {
    const base = `${qboApiBase()}/v3/company/${conn.realm_id}`;
    const customerWhere = since
      ? ` where Metadata.LastUpdatedTime > '${since}'`
      : "";
    const invoiceWhere = since
      ? ` where Metadata.LastUpdatedTime > '${since}'`
      : "";
    const cRes = await fetch(
      `${base}/query?query=${encodeURIComponent(`select * from Customer${customerWhere} maxresults 500`)}&minorversion=65`,
      { headers: auth },
    );
    const cJson = await readJson(cRes, "QuickBooks customers");
    for (const c of cJson?.QueryResponse?.Customer ?? []) {
      customerRows.push([
        String(c.Id ?? ""),
        c.CompanyName || c.DisplayName || c.FullyQualifiedName || "",
        c.PrimaryEmailAddr?.Address ?? "",
        isoDate(c.MetaData?.CreateTime),
        "",
        "",
        c.BillAddr?.CountrySubDivisionCode || c.BillAddr?.Country || "",
      ]);
    }
    const iRes = await fetch(
      `${base}/query?query=${encodeURIComponent(`select * from Invoice${invoiceWhere} maxresults 1000`)}&minorversion=65`,
      { headers: auth },
    );
    const iJson = await readJson(iRes, "QuickBooks invoices");
    for (const inv of iJson?.QueryResponse?.Invoice ?? []) {
      txnRows.push([
        String(inv.CustomerRef?.value ?? ""),
        String(inv.DocNumber || inv.Id || ""),
        String(inv.TotalAmt ?? ""),
        isoDate(inv.TxnDate),
        inv.Line?.find((l: any) => l.SalesItemLineDetail)?.Description ?? "Invoice",
        inv.CurrencyRef?.value ?? "USD",
      ]);
    }
  } else if (provider === "xero") {
    const xauth: Record<string, string> = {
      ...auth,
      "Xero-tenant-id": conn.tenant_id ?? "",
    };
    if (since) xauth["If-Modified-Since"] = new Date(since).toUTCString();
    const cRes = await fetch("https://api.xero.com/api.xro/2.0/Contacts", {
      headers: xauth,
    });
    const cJson = await readJson(cRes, "Xero contacts");
    for (const c of cJson?.Contacts ?? []) {
      customerRows.push([
        String(c.ContactID ?? ""),
        c.Name ?? "",
        c.EmailAddress ?? "",
        "",
        "",
        "",
        c.Addresses?.[0]?.Country ?? "",
      ]);
    }
    const iRes = await fetch(
      "https://api.xero.com/api.xro/2.0/Invoices?where=Type==%22ACCREC%22",
      { headers: xauth },
    );
    const iJson = await readJson(iRes, "Xero invoices");
    for (const inv of iJson?.Invoices ?? []) {

      txnRows.push([
        String(inv.Contact?.ContactID ?? ""),
        String(inv.InvoiceNumber || inv.InvoiceID || ""),
        String(inv.Total ?? ""),
        isoDate(inv.DateString || inv.Date),
        inv.LineItems?.[0]?.Description ?? "Invoice",
        inv.CurrencyCode ?? "",
      ]);
    }
  } else {
    // freshbooks
    const acct = conn.account_id;
    const sinceQs = since
      ? `&search[updated_min]=${encodeURIComponent(since)}`
      : "";
    const cRes = await fetch(
      `https://api.freshbooks.com/accounting/account/${acct}/users/clients?per_page=200${sinceQs}`,
      { headers: auth },
    );
    const cJson = await readJson(cRes, "FreshBooks clients");
    for (const c of cJson?.response?.result?.clients ?? []) {
      const name =
        c.organization ||
        `${c.fname ?? ""} ${c.lname ?? ""}`.trim() ||
        c.email ||
        "";
      customerRows.push([
        String(c.id ?? ""),
        name,
        c.email ?? "",
        isoDate(c.signup_date),
        "",
        "",
        c.p_country ?? "",
      ]);
    }
    const iRes = await fetch(
      `https://api.freshbooks.com/accounting/account/${acct}/invoices/invoices?per_page=500${sinceQs}`,
      { headers: auth },
    );
    const iJson = await readJson(iRes, "FreshBooks invoices");
    for (const inv of iJson?.response?.result?.invoices ?? []) {
      txnRows.push([
        String(inv.customerid ?? ""),
        String(inv.invoice_number || inv.id || ""),
        String(inv.amount?.amount ?? ""),
        isoDate(inv.create_date),
        inv.lines?.[0]?.name ?? "Invoice",
        inv.amount?.code ?? inv.currency_code ?? "",
      ]);
    }
  }

  // Record this successful pull so the next sync only fetches deltas.
  const db = await admin();
  await db
    .from("accounting_connections")
    .update({ last_synced_at: startedAt })
    .eq("user_id", userId)
    .eq("provider", provider);


  const datasets: ExtractedDataset[] = [];
  if (customerRows.length) {
    datasets.push({
      key: "customers",
      label: "Customers",
      headers: CUSTOMER_HEADERS,
      rows: customerRows,
      confidence: 92,
      note: "Customers synced live from your accounting account.",
    });
  }
  if (txnRows.length) {
    datasets.push({
      key: "transactions",
      label: "Transactions",
      headers: TRANSACTION_HEADERS,
      rows: txnRows,
      confidence: 88,
      note: "Invoices synced live from your accounting account.",
    });
  }
  return datasets;
}
