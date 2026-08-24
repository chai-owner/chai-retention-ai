// Server-only helpers for Zoho CRM per-user OAuth. Each user connects their
// own Zoho account; we store their refresh token and refresh access tokens
// as needed. Never import from client code.
import type { ExtractedDataset } from "./ingest.functions";
import {
  encryptSecret,
  decryptSecret,
  decryptSecretOrNull,
} from "./connection-key-crypto.server";

export const ZOHO_SCOPES = [
  "ZohoCRM.modules.ALL",
  "ZohoCRM.settings.READ",
  "ZohoCRM.users.READ",
  "AaaServer.profile.READ",
].join(",");

export function getZohoCreds(): { clientId: string; clientSecret: string; defaultDc: string } {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const defaultDc = process.env.ZOHO_DATA_CENTER || "com";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Zoho CRM isn't configured. Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret, defaultDc };
}

export function hasZohoCreds(): boolean {
  try { getZohoCreds(); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Multi data center support
// ---------------------------------------------------------------------------
// Zoho hosts each customer in one region. After consent, Zoho returns
// `location` and `accounts-server` on the callback; those decide where the
// authorization code must be redeemed. Both are attacker-controllable query
// parameters, so they are only accepted when they map onto this allowlist.
export const ZOHO_ACCOUNTS_SERVERS: Record<string, string> = {
  com: "https://accounts.zoho.com",
  eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",
  "com.au": "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zohocloud.ca",
  uk: "https://accounts.zoho.uk",
  "com.cn": "https://accounts.zoho.com.cn",
  sa: "https://accounts.zoho.sa",
};

/** Zoho's `location` values ("us", "eu", ...) mapped to our dc keys. */
const LOCATION_TO_DC: Record<string, string> = {
  us: "com",
  com: "com",
  eu: "eu",
  in: "in",
  au: "com.au",
  "com.au": "com.au",
  jp: "jp",
  ca: "ca",
  uk: "uk",
  cn: "com.cn",
  "com.cn": "com.cn",
  sa: "sa",
};

// Zoho accounts server per data center (com, eu, in, com.au, jp, ca).
export function accountsHost(dc: string): string {
  return ZOHO_ACCOUNTS_SERVERS[dc] ?? `https://accounts.zoho.${dc}`;
}

/** Returns the canonical accounts server for a Zoho `location`, or null. */
export function dcFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const dc = LOCATION_TO_DC[location.trim().toLowerCase()];
  return dc ?? null;
}

/**
 * Validates an `accounts-server` value against the allowlist. Returns the
 * canonical `{ dc, accountsServer }` pair, or null for anything unsupported
 * (http, look-alike hosts, path/credential tricks, arbitrary domains).
 */
export function validateAccountsServer(
  value: string | null | undefined,
): { dc: string; accountsServer: string } | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  for (const [dc, server] of Object.entries(ZOHO_ACCOUNTS_SERVERS)) {
    if (new URL(server).hostname === host) return { dc, accountsServer: server };
  }
  return null;
}

/**
 * Resolves where to redeem the code, preferring Zoho's validated
 * `accounts-server`, then its `location`, then the data center stored with the
 * OAuth state (which is how existing EU connections keep working).
 */
export function resolveCallbackDataCenter(args: {
  accountsServer?: string | null;
  location?: string | null;
  storedDc: string;
}): { dc: string; accountsServer: string } {
  const validated = validateAccountsServer(args.accountsServer);
  if (validated) return validated;
  const fromLocation = dcFromLocation(args.location);
  if (fromLocation) {
    return { dc: fromLocation, accountsServer: accountsHost(fromLocation) };
  }
  return { dc: args.storedDc, accountsServer: accountsHost(args.storedDc) };
}

/** CRM API base for a data center, used when Zoho omits `api_domain`. */
export function apiDomainForDc(dc: string): string {
  return dc === "ca" ? "https://www.zohoapis.ca" : `https://www.zohoapis.${dc}`;
}

export function buildZohoAuthorizeUrl(dc: string, redirectUri: string, state: string): string {
  const { clientId } = getZohoCreds();
  const p = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: clientId,
    response_type: "code",
    access_type: "offline",
    redirect_uri: redirectUri,
    state,
    prompt: "consent",
  });
  return `${accountsHost(dc)}/oauth/v2/auth?${p}`;
}

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  apiDomain: string;
  expiresAt?: string;
}

function expiryFrom(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  return new Date(Date.now() + (seconds - 60) * 1000).toISOString();
}

async function readJson(res: Response, ctx: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`${ctx} failed [${res.status}]: ${text}`);
    throw new Error(`${ctx} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { throw new Error(`${ctx}: invalid JSON`); }
}

export async function exchangeZohoCode(args: {
  /** Validated accounts server for the customer's data center. */
  accountsServer: string;
  dc: string;
  code: string;
  redirectUri: string;
}): Promise<TokenSet> {
  const { accountsServer, dc, code, redirectUri } = args;
  const { clientId, clientSecret } = getZohoCreds();
  const res = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const j = await readJson(res, "Zoho token exchange");
  if (j.error) throw new Error(`Zoho token exchange failed: ${j.error}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    apiDomain: j.api_domain || apiDomainForDc(dc),
    expiresAt: expiryFrom(j.expires_in),
  };
}

export async function refreshZohoToken(
  accountsServer: string,
  refreshToken: string,
  dc: string,
): Promise<TokenSet> {
  const { clientId, clientSecret } = getZohoCreds();
  const res = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const j = await readJson(res, "Zoho token refresh");
  if (j.error) throw new Error(`Zoho token refresh failed: ${j.error}`);
  return {
    accessToken: j.access_token,
    refreshToken,
    apiDomain: j.api_domain || apiDomainForDc(dc),
    expiresAt: expiryFrom(j.expires_in),
  };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function resolveOrgName(apiDomain: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiDomain}/crm/v6/org`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.org?.[0]?.company_name ?? null;
  } catch { return null; }
}

export async function saveZohoConnection(
  userId: string,
  dc: string,
  tokens: TokenSet,
  orgName: string | null,
  accountsServer?: string,
): Promise<void> {
  const db = await admin();
  const { error } = await db.from("zoho_crm_connections").upsert(
    {
      user_id: userId,
      dc,
      accounts_server: accountsServer ?? accountsHost(dc),
      access_token: encryptSecret(tokens.accessToken),
      refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt ?? null,
      api_domain: tokens.apiDomain,
      org_name: orgName,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to save Zoho connection: ${error.message}`);
  const { ensureCrmSyncState } = await import("./crm.server");
  await ensureCrmSyncState(userId, "zoho_crm");
}

interface Row {
  id: string;
  user_id: string;
  dc: string;
  accounts_server: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  api_domain: string;
  org_name: string | null;
  last_synced_at: string | null;
}

async function loadFreshZohoConnection(userId: string): Promise<Row> {
  const db = await admin();
  const { data, error } = await db
    .from("zoho_crm_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Zoho CRM isn't connected for your account.");
  const row = data as Row;
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecretOrNull(row.refresh_token);
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  if (expired && row.refresh_token) {
    // Always refresh against the data center this connection actually lives in.
    const accountsServer =
      validateAccountsServer(row.accounts_server)?.accountsServer ?? accountsHost(row.dc);
    const refreshed = await refreshZohoToken(accountsServer, row.refresh_token, row.dc);
    await db.from("zoho_crm_connections").update({
      access_token: encryptSecret(refreshed.accessToken),
      expires_at: refreshed.expiresAt ?? null,
      api_domain: refreshed.apiDomain,
    }).eq("id", row.id);
    row.access_token = refreshed.accessToken;
    row.expires_at = refreshed.expiresAt ?? null;
    row.api_domain = refreshed.apiDomain;
  }
  return row;
}

function toStr(v: unknown): string { return v == null ? "" : String(v); }
function dateOnly(v: unknown): string {
  const s = toStr(v); if (!s) return "";
  const d = new Date(s); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function num(v: unknown): string {
  const s = toStr(v).replace(/[^0-9.\-]/g, "");
  return s === "" || isNaN(Number(s)) ? "" : String(Number(s));
}

import { domainEmailHint } from "./crm-identity";

const CUSTOMER_HEADERS = ["customer_id","name","email","signup_date","monthly_revenue","plan","region"];
const TRANSACTION_HEADERS = ["customer_id","transaction_id","amount","transaction_date","product","currency"];

export async function syncZohoForUser(
  userId: string,
  limit: number,
  since: string | null,
): Promise<ExtractedDataset[]> {
  const conn = await loadFreshZohoConnection(userId);
  const auth: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${conn.access_token}`,
    Accept: "application/json",
  };
  if (since) auth["If-Modified-Since"] = new Date(since).toUTCString();

  const cap = Math.min(limit, 200);
  const accFields = "Account_Name,Website,Created_Time,Annual_Revenue,Industry,Billing_Country";
  const dealFields = "Deal_Name,Account_Name,Amount,Closing_Date,Stage";

  async function get(path: string) {
    const res = await fetch(`${conn.api_domain}/crm/v6${path}`, { headers: auth });
    if (res.status === 204 || res.status === 304) return null;
    const body = await res.text();
    if (!res.ok) throw new Error(`Zoho request failed [${res.status}]: ${body.slice(0, 300)}`);
    return body ? JSON.parse(body) : null;
  }

  const [acc, deals, contacts] = await Promise.all([
    get(`/Accounts?fields=${encodeURIComponent(accFields)}&per_page=${cap}`),
    get(`/Deals?fields=${encodeURIComponent(dealFields)}&per_page=${cap}`),
    // Primary contact email per account — the strongest cross-platform signal.
    get(`/Contacts?fields=${encodeURIComponent("Email,Account_Name")}&per_page=${cap}`).catch(() => null),
  ]);

  const emailByAccount = new Map<string, string>();
  for (const c of (contacts?.data ?? []) as Record<string, unknown>[]) {
    const account = c.Account_Name as { id?: string } | undefined;
    const accId = account && typeof account === "object" ? toStr(account.id) : "";
    const email = toStr(c.Email);
    if (accId && email && !emailByAccount.has(accId)) emailByAccount.set(accId, email);
  }

  const customers: string[][] = (acc?.data ?? []).map((r: Record<string, unknown>) => [
    toStr(r.id), toStr(r.Account_Name),
    emailByAccount.get(toStr(r.id)) ?? domainEmailHint(toStr(r.Website)),
    dateOnly(r.Created_Time),
    num((r.Annual_Revenue as number) ? Number(r.Annual_Revenue) / 12 : ""),
    toStr(r.Industry), toStr(r.Billing_Country),
  ]);
  const transactions: string[][] = (deals?.data ?? []).map((r: Record<string, unknown>) => {
    const account = r.Account_Name as { id?: string } | string | undefined;
    const accountId = typeof account === "object" && account ? toStr(account.id) : "";
    return [accountId, toStr(r.id), num(r.Amount), dateOnly(r.Closing_Date), toStr(r.Deal_Name), "USD"];
  });

  const out: ExtractedDataset[] = [];
  if (customers.length) {
    out.push({ key: "customers", label: "Customers", headers: CUSTOMER_HEADERS, rows: customers, confidence: 95, note: "Imported from Zoho CRM accounts." });
  }
  if (transactions.length) {
    out.push({ key: "transactions", label: "Transactions", headers: TRANSACTION_HEADERS, rows: transactions, confidence: 92, note: "Imported from Zoho CRM deals." });
  }
  return out;
}

export async function getZohoStatusRow(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("zoho_crm_connections")
    .select("org_name, connected_at, api_domain, dc")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { org_name: string | null; connected_at: string; api_domain: string; dc: string } | null;
}

export async function deleteZohoConnection(userId: string) {
  const db = await admin();
  const { clearCrmSyncState } = await import("./crm.server");
  await clearCrmSyncState(userId, "zoho_crm");
  const { error } = await db.from("zoho_crm_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// Attempt to revoke the refresh token at Zoho (best-effort).
export async function revokeZohoRefreshToken(dc: string, refreshToken: string) {
  try {
    await fetch(`${accountsHost(dc)}/oauth/v2/token/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  } catch { /* ignore */ }
}
