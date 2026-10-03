// Ported verbatim from src/lib/accounting.server.ts. Fully self-contained:
// talks directly to QuickBooks / Xero / FreshBooks using your own developer
// app credentials, tokens stored (encrypted) in your own DB. No Lovable
// dependency. Requires QUICKBOOKS_CLIENT_ID/SECRET, XERO_CLIENT_ID/SECRET,
// FRESHBOOKS_CLIENT_ID/SECRET as project secrets (only the ones you actually
// use need to be set — providers without connections simply never get called).
import { Buffer } from "node:buffer";
import type { ExtractedDataset } from "./types.ts";
import { encryptSecret, decryptSecret, decryptSecretOrNull } from "./crypto.ts";
import { getSupabaseAdmin } from "./client.ts";

export type AccountingProvider = "quickbooks" | "xero" | "freshbooks";

export function providerName(p: AccountingProvider): string {
  const map: Record<AccountingProvider, string> = {
    quickbooks: "QuickBooks Online",
    xero: "Xero",
    freshbooks: "FreshBooks",
  };
  return map[p] ?? p;
}

interface Creds {
  clientId: string;
  clientSecret: string;
}

function getCreds(provider: AccountingProvider): Creds {
  const map: Record<AccountingProvider, [string, string]> = {
    quickbooks: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    xero: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
    freshbooks: ["FRESHBOOKS_CLIENT_ID", "FRESHBOOKS_CLIENT_SECRET"],
  };
  const [idKey, secretKey] = map[provider];
  const clientId = Deno.env.get(idKey);
  const clientSecret = Deno.env.get(secretKey);
  if (!clientId || !clientSecret) {
    throw new Error(`${providerName(provider)} is not configured. Missing ${idKey}/${secretKey}.`);
  }
  return { clientId, clientSecret };
}

function qboApiBase(): string {
  return Deno.env.get("QUICKBOOKS_ENVIRONMENT") === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
}

const REFRESH_SKEW_MS = 120_000;
const LOCK_TTL_MS = 30_000;

function expiryFrom(expiresInSec?: number): string | undefined {
  if (!expiresInSec) return undefined;
  return new Date(Date.now() + expiresInSec * 1000).toISOString();
}

// deno-lint-ignore no-explicit-any
function refreshExpiryFrom(j: any): string | undefined {
  const secs = j?.x_refresh_token_expires_in ?? j?.refresh_expires_in ?? j?.refresh_token_expires_in;
  const n = Number(secs);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000).toISOString() : undefined;
}

function basicAuth({ clientId, clientSecret }: Creds): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function redactSecrets(text: string): string {
  return text
    .replace(/("(?:access|refresh|id)_token"\s*:\s*")[^"]+/gi, "$1[redacted]")
    .replace(/(client_secret=|code=)[^&\s"]+/gi, "$1[redacted]");
}

// deno-lint-ignore no-explicit-any
async function readJson(res: Response, ctx: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`${ctx} failed [${res.status}]: ${redactSecrets(text).slice(0, 500)}`);
    throw new Error(`${ctx} failed [${res.status}]: ${redactSecrets(text).slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${ctx}: could not parse response`);
  }
}

async function refreshTokens(provider: AccountingProvider, refreshToken: string): Promise<TokenSet> {
  const creds = getCreds(provider);
  if (provider === "quickbooks") {
    const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        Authorization: basicAuth(creds),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const j = await readJson(res, "QuickBooks token refresh");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? refreshToken,
      expiresAt: expiryFrom(j.expires_in),
      refreshTokenExpiresAt: refreshExpiryFrom(j),
    };
  }
  if (provider === "xero") {
    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { Authorization: basicAuth(creds), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const j = await readJson(res, "Xero token refresh");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? refreshToken,
      expiresAt: expiryFrom(j.expires_in),
      refreshTokenExpiresAt: refreshExpiryFrom(j),
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
    refreshTokenExpiresAt: refreshExpiryFrom(j),
  };
}

export interface ConnectionRow {
  id: string;
  provider: AccountingProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_token_expires_at?: string | null;
  status?: string | null;
  refresh_lock_at?: string | null;
  realm_id: string | null;
  tenant_id: string | null;
  account_id: string | null;
  company_name: string | null;
  connected_at: string;
  tenants?: XeroTenant[] | null;
  last_synced_at?: string | null;
}

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  [key: string]: string;
}

async function admin() {
  return getSupabaseAdmin();
}

function logAccounting(provider: AccountingProvider, operation: string, detail: Record<string, unknown>) {
  console.error(
    JSON.stringify({ scope: "accounting", provider, operation, at: new Date().toISOString(), ...detail }),
  );
}

export class AccountingReauthRequired extends Error {
  provider: AccountingProvider;
  constructor(provider: AccountingProvider) {
    super(`Your ${providerName(provider)} connection needs to be reconnected. Open the Data page and reconnect.`);
    this.provider = provider;
  }
}

async function markAccountingNeedsReauth(userId: string, provider: AccountingProvider, message: string): Promise<void> {
  const db = await admin();
  await db
    .from("accounting_connections")
    .update({
      status: "needs_reauth",
      last_error_at: new Date().toISOString(),
      last_error_message: message.slice(0, 300),
      refresh_lock_at: null,
    })
    .eq("user_id", userId)
    .eq("provider", provider);
}

function decryptRow(row: ConnectionRow): ConnectionRow {
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);
  return row;
}

async function readConnection(userId: string, provider: AccountingProvider): Promise<ConnectionRow> {
  const db = await admin();
  const { data, error } = await db
    .from("accounting_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${providerName(provider)} is not connected.`);
  return decryptRow(data as unknown as ConnectionRow);
}

function accessTokenUsable(row: ConnectionRow): boolean {
  const expiry = row.expires_at ? new Date(row.expires_at).getTime() : null;
  return expiry === null || expiry - REFRESH_SKEW_MS > Date.now();
}

function lockIsStale(row: ConnectionRow, ttlMs: number): boolean {
  if (!row.refresh_lock_at) return true;
  return new Date(row.refresh_lock_at).getTime() < Date.now() - ttlMs;
}

async function claimRefreshLock(connectionId: string): Promise<boolean> {
  const db = await admin();
  const staleLock = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data: locked } = await db
    .from("accounting_connections")
    .update({ refresh_lock_at: new Date().toISOString() })
    .eq("id", connectionId)
    .or(`refresh_lock_at.is.null,refresh_lock_at.lt.${staleLock}`)
    .select("id");
  return Array.isArray(locked) ? locked.length > 0 : Boolean(locked);
}

type WaitOutcome =
  | { kind: "fresh"; row: ConnectionRow }
  | { kind: "reauth" }
  | { kind: "retry"; row: ConnectionRow };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const LOCK_POLL_INTERVAL_MS = 250;
const LOCK_POLL_MAX_INTERVAL_MS = 1_000;

async function awaitRefreshWinner(userId: string, provider: AccountingProvider): Promise<WaitOutcome> {
  const budget = LOCK_TTL_MS;
  const deadline = Date.now() + budget;
  let interval = LOCK_POLL_INTERVAL_MS;
  let latest: ConnectionRow | null = null;

  while (Date.now() < deadline) {
    await defaultSleep(Math.min(interval, Math.max(0, deadline - Date.now())));
    interval = Math.min(interval * 2, LOCK_POLL_MAX_INTERVAL_MS);
    latest = await readConnection(userId, provider);
    if (latest.status === "needs_reauth") return { kind: "reauth" };
    if (!latest.refresh_lock_at) {
      if (accessTokenUsable(latest)) return { kind: "fresh", row: latest };
      return { kind: "retry", row: latest };
    }
    if (lockIsStale(latest, LOCK_TTL_MS)) return { kind: "retry", row: latest };
  }

  const finalRow = latest ?? (await readConnection(userId, provider));
  if (finalRow.status === "needs_reauth") return { kind: "reauth" };
  if (accessTokenUsable(finalRow)) return { kind: "fresh", row: finalRow };
  return { kind: "retry", row: finalRow };
}

export async function refreshWithLock(
  userId: string,
  provider: AccountingProvider,
  row: ConnectionRow,
): Promise<ConnectionRow> {
  const db = await admin();

  for (let attempt = 0; attempt < 2; attempt++) {
    if (await claimRefreshLock(row.id)) break;

    const outcome = await awaitRefreshWinner(userId, provider);
    if (outcome.kind === "reauth") throw new AccountingReauthRequired(provider);
    if (outcome.kind === "fresh") return outcome.row;
    row = outcome.row;
    if (attempt === 1) return row;
  }

  if (!row.refresh_token) {
    await markAccountingNeedsReauth(userId, provider, "No refresh token stored.");
    throw new AccountingReauthRequired(provider);
  }

  try {
    const t = await refreshTokens(provider, row.refresh_token);
    await db
      .from("accounting_connections")
      .update({
        access_token: encryptSecret(t.accessToken),
        refresh_token: t.refreshToken ? encryptSecret(t.refreshToken) : encryptSecret(row.refresh_token),
        expires_at: t.expiresAt ?? null,
        refresh_token_expires_at: t.refreshTokenExpiresAt ?? row.refresh_token_expires_at ?? null,
        status: "connected",
        last_error_at: null,
        last_error_message: null,
        refresh_lock_at: null,
      })
      .eq("id", row.id);
    row.access_token = t.accessToken;
    row.refresh_token = t.refreshToken ?? row.refresh_token;
    row.expires_at = t.expiresAt ?? null;
    row.refresh_token_expires_at = t.refreshTokenExpiresAt ?? row.refresh_token_expires_at ?? null;
    row.status = "connected";
    return row;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token refresh failed.";
    logAccounting(provider, "refresh", { connectionId: row.id, userId, outcome: "failed", message: msg.slice(0, 200) });
    await markAccountingNeedsReauth(userId, provider, msg);
    throw new AccountingReauthRequired(provider);
  }
}

async function loadFreshConnection(userId: string, provider: AccountingProvider): Promise<ConnectionRow> {
  const row = await readConnection(userId, provider);
  if (row.status === "needs_reauth") throw new AccountingReauthRequired(provider);

  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const needsRefresh = expiresMs !== null && expiresMs - REFRESH_SKEW_MS < Date.now();
  if (!needsRefresh) return row;

  if (!row.refresh_token) {
    await markAccountingNeedsReauth(userId, provider, "Access token expired and no refresh token is stored.");
    throw new AccountingReauthRequired(provider);
  }
  const refreshExpired =
    row.refresh_token_expires_at != null && new Date(row.refresh_token_expires_at).getTime() < Date.now();
  if (refreshExpired) {
    await markAccountingNeedsReauth(userId, provider, "Refresh token expired.");
    throw new AccountingReauthRequired(provider);
  }

  return refreshWithLock(userId, provider, row);
}

function makeAccountingClient(userId: string, provider: AccountingProvider, conn: ConnectionRow) {
  const state = { conn };
  const call = (url: string, extraHeaders: Record<string, string>) =>
    fetch(url, {
      headers: { ...extraHeaders, Authorization: `Bearer ${state.conn.access_token}`, Accept: "application/json" },
    });

  return {
    get current() {
      return state.conn;
    },
    async fetchJson(url: string, ctx: string, extraHeaders: Record<string, string> = {}) {
      let res = await call(url, extraHeaders);
      if (res.status === 401) {
        state.conn = await refreshWithLock(userId, provider, state.conn);
        res = await call(url, extraHeaders);
        if (res.status === 401) {
          await markAccountingNeedsReauth(userId, provider, `${providerName(provider)} rejected the refreshed access token.`);
          throw new AccountingReauthRequired(provider);
        }
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "0");
        if (retryAfter > 0 && retryAfter <= 30) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          res = await call(url, extraHeaders);
        }
      }
      return readJson(res, ctx);
    },
  };
}

const CUSTOMER_HEADERS = ["customer_id", "name", "email", "signup_date", "monthly_revenue", "plan", "region"];
const TRANSACTION_HEADERS = [
  "customer_id", "transaction_id", "amount", "transaction_date", "product", "currency",
  "due_date", "amount_due", "paid_date", "days_overdue",
];

function isoDate(v: unknown): string {
  if (!v) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function daysOverdue(dueDate: unknown, amountDue: unknown, now: number = Date.now()): number {
  const due = isoDate(dueDate);
  const outstanding = Number(amountDue);
  if (!due || !Number.isFinite(outstanding) || outstanding <= 0) return 0;
  const dueMs = Date.parse(`${due}T00:00:00Z`);
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  if (isNaN(dueMs) || dueMs >= today) return 0;
  return Math.round((today - dueMs) / 86_400_000);
}

function numStr(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

export async function fetchAndNormalize(
  userId: string,
  provider: AccountingProvider,
  sinceOverride?: string | null,
): Promise<ExtractedDataset[]> {
  const conn = await loadFreshConnection(userId, provider);
  const api = makeAccountingClient(userId, provider, conn);
  const since =
    sinceOverride === undefined ? ((conn as unknown as { last_synced_at?: string | null }).last_synced_at ?? null) : sinceOverride;
  const startedAt = new Date().toISOString();

  const customerRows: string[][] = [];
  const txnRows: string[][] = [];

  if (provider === "quickbooks") {
    const base = `${qboApiBase()}/v3/company/${conn.realm_id}`;
    const customerWhere = since ? ` where Metadata.LastUpdatedTime > '${since}'` : "";
    const invoiceWhere = since ? ` where Metadata.LastUpdatedTime > '${since}'` : "";
    const cJson = await api.fetchJson(
      `${base}/query?query=${encodeURIComponent(`select * from Customer${customerWhere} maxresults 500`)}&minorversion=65`,
      "QuickBooks customers",
    );
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
    const iJson = await api.fetchJson(
      `${base}/query?query=${encodeURIComponent(`select * from Invoice${invoiceWhere} maxresults 1000`)}&minorversion=65`,
      "QuickBooks invoices",
    );
    for (const inv of iJson?.QueryResponse?.Invoice ?? []) {
      txnRows.push([
        String(inv.CustomerRef?.value ?? ""),
        String(inv.DocNumber || inv.Id || ""),
        String(inv.TotalAmt ?? ""),
        isoDate(inv.TxnDate),
        // deno-lint-ignore no-explicit-any
        inv.Line?.find((l: any) => l.SalesItemLineDetail)?.Description ?? "Invoice",
        inv.CurrencyRef?.value ?? "USD",
        isoDate(inv.DueDate),
        numStr(inv.Balance),
        "",
        String(daysOverdue(inv.DueDate, inv.Balance)),
      ]);
    }
  } else if (provider === "xero") {
    const allTenants: XeroTenant[] = Array.isArray(conn.tenants) ? conn.tenants : [];
    const activeTenants: XeroTenant[] = conn.tenant_id
      ? [allTenants.find((t) => t.tenantId === conn.tenant_id) ?? { tenantId: conn.tenant_id, tenantName: conn.company_name ?? conn.tenant_id }]
      : allTenants.length
        ? allTenants
        : [];
    if (!activeTenants.length) {
      throw new Error("No Xero organisation is linked to this connection. Reconnect Xero from the Data page.");
    }

    const PAGE_SIZE = 100;
    for (const tenant of activeTenants) {
      const xauth: Record<string, string> = { "Xero-tenant-id": tenant.tenantId };
      if (since) xauth["If-Modified-Since"] = new Date(since).toUTCString();

      for (let page = 1; page <= 50; page++) {
        const cJson = await api.fetchJson(
          `https://api.xero.com/api.xro/2.0/Contacts?page=${page}`,
          `Xero contacts (${tenant.tenantName})`,
          xauth,
        );
        const contacts = cJson?.Contacts ?? [];
        for (const c of contacts) {
          customerRows.push([
            String(c.ContactID ?? ""), c.Name ?? "", c.EmailAddress ?? "", "", "", "",
            c.Addresses?.[0]?.Country ?? "",
          ]);
        }
        if (contacts.length < PAGE_SIZE) break;
      }

      for (let page = 1; page <= 50; page++) {
        const iJson = await api.fetchJson(
          `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}`,
          `Xero invoices (${tenant.tenantName})`,
          xauth,
        );
        const invoices = iJson?.Invoices ?? [];
        for (const inv of invoices) {
          txnRows.push([
            String(inv.Contact?.ContactID ?? ""),
            String(inv.InvoiceNumber || inv.InvoiceID || ""),
            String(inv.Total ?? ""),
            isoDate(inv.DateString || inv.Date),
            inv.LineItems?.[0]?.Description ?? "Invoice",
            inv.CurrencyCode ?? "",
            isoDate(inv.DueDateString || inv.DueDate),
            numStr(inv.AmountDue),
            isoDate(inv.FullyPaidOnDate),
            String(daysOverdue(inv.DueDateString || inv.DueDate, inv.AmountDue)),
          ]);
        }
        if (invoices.length < PAGE_SIZE) break;
      }
    }
  } else {
    const acct = conn.account_id;
    if (!acct) throw new Error("This FreshBooks connection has no account id. Reconnect FreshBooks from the Data page.");
    const sinceMs = since ? new Date(since).getTime() : null;
    const PER_PAGE = 100;
    const MAX_PAGES = 25;

    const updatedMs = (v: unknown): number | null => {
      if (!v) return null;
      const t = new Date(String(v).replace(" ", "T") + (String(v).includes("Z") ? "" : "Z")).getTime();
      return isNaN(t) ? null : t;
    };

    let stop = false;
    for (let page = 1; page <= MAX_PAGES && !stop; page++) {
      const cJson = await api.fetchJson(
        `https://api.freshbooks.com/accounting/account/${acct}/users/clients?per_page=${PER_PAGE}&page=${page}&sort=updated_desc`,
        "FreshBooks clients",
      );
      const result = cJson?.response?.result ?? {};
      const clients = result.clients ?? [];
      for (const c of clients) {
        const ts = updatedMs(c.updated);
        if (sinceMs != null && ts != null && ts < sinceMs) { stop = true; break; }
        const name = c.organization || `${c.fname ?? ""} ${c.lname ?? ""}`.trim() || c.email || "";
        customerRows.push([String(c.id ?? ""), name, c.email ?? "", isoDate(c.signup_date), "", "", c.p_country ?? ""]);
      }
      if (clients.length < PER_PAGE || page >= (result.pages ?? page)) break;
    }

    stop = false;
    for (let page = 1; page <= MAX_PAGES && !stop; page++) {
      const iJson = await api.fetchJson(
        `https://api.freshbooks.com/accounting/account/${acct}/invoices/invoices?per_page=${PER_PAGE}&page=${page}&sort=updated_desc`,
        "FreshBooks invoices",
      );
      const result = iJson?.response?.result ?? {};
      const invoices = result.invoices ?? [];
      for (const inv of invoices) {
        const ts = updatedMs(inv.updated);
        if (sinceMs != null && ts != null && ts < sinceMs) { stop = true; break; }
        txnRows.push([
          String(inv.customerid ?? ""),
          String(inv.invoice_number || inv.id || ""),
          String(inv.amount?.amount ?? ""),
          isoDate(inv.create_date),
          inv.lines?.[0]?.name ?? "Invoice",
          inv.amount?.code ?? inv.currency_code ?? "",
          isoDate(inv.due_date),
          numStr(inv.outstanding?.amount),
          "",
          String(daysOverdue(inv.due_date, inv.outstanding?.amount)),
        ]);
      }
      if (invoices.length < PER_PAGE || page >= (result.pages ?? page)) break;
    }
  }

  const db = await admin();
  await db.from("accounting_connections").update({ last_synced_at: startedAt }).eq("user_id", userId).eq("provider", provider);

  const datasets: ExtractedDataset[] = [];
  if (customerRows.length) {
    datasets.push({
      key: "customers", label: "Customers", headers: CUSTOMER_HEADERS, rows: customerRows,
      confidence: 92, note: "Customers synced live from your accounting account.",
    });
  }
  if (txnRows.length) {
    datasets.push({
      key: "transactions", label: "Transactions", headers: TRANSACTION_HEADERS, rows: txnRows,
      confidence: 88, note: "Invoices synced live from your accounting account.",
    });
  }
  return datasets;
}

// ---------------------------------------------------------------------------
// Interactive OAuth: start + callback (added so the "Connect" flow no longer
// depends on the app's own hosting having these secrets — see oauth-start and
// oauth-callback functions). Ported from buildAuthorizeUrl / exchangeCode /
// resolveAccountInfo / saveConnection in src/lib/accounting.server.ts.
// ---------------------------------------------------------------------------

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
      scope: "openid profile email accounting.contacts.read accounting.invoices.read offline_access",
      redirect_uri: redirectUri,
      state,
    });
    return `https://login.xero.com/identity/connect/authorize?${p}`;
  }
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `https://auth.freshbooks.com/oauth/authorize?${p}`;
}

export async function exchangeCode(
  provider: AccountingProvider,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const creds = getCreds(provider);
  if (provider === "quickbooks") {
    const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        Authorization: basicAuth(creds),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const j = await readJson(res, "QuickBooks token exchange");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: expiryFrom(j.expires_in),
      refreshTokenExpiresAt: refreshExpiryFrom(j),
    };
  }
  if (provider === "xero") {
    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { Authorization: basicAuth(creds), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const j = await readJson(res, "Xero token exchange");
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: expiryFrom(j.expires_in),
      refreshTokenExpiresAt: refreshExpiryFrom(j),
    };
  }
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
    refreshTokenExpiresAt: refreshExpiryFrom(j),
  };
}

export interface AccountInfo {
  realmId?: string;
  tenantId?: string;
  tenants?: { tenantId: string; tenantName: string }[];
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
      throw new Error("QuickBooks did not return a company (realm) id. Please retry the connection from the Data page.");
    }
    let companyName: string | undefined;
    try {
      const res = await fetch(
        `${qboApiBase()}/v3/company/${realmIdFromCallback}/companyinfo/${realmIdFromCallback}?minorversion=65`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" } },
      );
      if (res.ok) {
        const j = await res.json();
        companyName = j?.CompanyInfo?.CompanyName;
      }
    } catch { /* best-effort company name */ }
    return { realmId: realmIdFromCallback, companyName };
  }
  if (provider === "xero") {
    const res = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
    });
    const conns = await readJson(res, "Xero connections");
    // deno-lint-ignore no-explicit-any
    const tenants = (Array.isArray(conns) ? conns : [])
      .filter((c: any) => c?.tenantId)
      // deno-lint-ignore no-explicit-any
      .map((c: any) => ({ tenantId: String(c.tenantId), tenantName: String(c.tenantName ?? c.tenantId) }));
    if (!tenants.length) {
      throw new Error("Xero authorised the app but returned no organisations. Grant access to at least one organisation and try again.");
    }
    return {
      tenants,
      tenantId: tenants.length === 1 ? tenants[0].tenantId : undefined,
      companyName: tenants.length === 1 ? tenants[0].tenantName : `${tenants.length} organisations`,
    };
  }
  const res = await fetch("https://api.freshbooks.com/auth/api/v1/users/me", {
    headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
  });
  const j = await readJson(res, "FreshBooks identity");
  // deno-lint-ignore no-explicit-any
  const memberships: any[] = [
    ...(Array.isArray(j?.response?.business_memberships) ? j.response.business_memberships : []),
    ...(Array.isArray(j?.response?.roles) ? j.response.roles : []),
  ];
  let accountId: string | undefined;
  let companyName: string | undefined;
  for (const m of memberships) {
    const id = m?.business?.account_id ?? m?.accountid ?? m?.account_id ?? m?.business?.id;
    if (id) {
      accountId = String(id);
      companyName = m?.business?.name ?? undefined;
      break;
    }
  }
  if (!accountId) {
    throw new Error("FreshBooks didn't return an account for this login. Make sure the user is a member of at least one FreshBooks business, then connect again.");
  }
  return { accountId, companyName };
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
      refresh_token_expires_at: tokens.refreshTokenExpiresAt ?? null,
      status: "connected",
      last_error_at: null,
      last_error_message: null,
      refresh_lock_at: null,
      realm_id: info.realmId ?? null,
      tenant_id: info.tenantId ?? null,
      account_id: info.accountId ?? null,
      tenants: (info.tenants ?? []) as unknown as never,
      company_name: info.companyName ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Failed to save connection: ${error.message}`);
}
