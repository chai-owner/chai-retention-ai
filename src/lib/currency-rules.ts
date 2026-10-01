// Single source of truth for which money amounts scoring may use, given the
// account's data currency. Shared by the customer page / live screens
// (real-scoring.ts) and the nightly score (customer-scoring.ts), like
// metric-direction.ts and metric-evidence.ts, so the two can never drift.
//
// Rules:
//  - A row's currency is its `currency` column (any ISO-style code).
//  - No currency → counts as the account's currency (most uploads have none).
//  - Same as the account's currency → counts.
//  - Different currency ("foreign") → its AMOUNTS are left out of every
//    amount-based measure and total (revenue, revenue at risk, est. saved,
//    order value, order-size trends, own-history and cross-customer amount
//    comparisons, deal value, custom measures that read amounts). The row
//    itself stays, so its DATE and its existence still count (days since last
//    purchase, number of invoices, payment overdue days).
//  - "Unconfirmed": QuickBooks invoices and HubSpot / Zoho deals synced before
//    ChAi read their real currency were stamped "USD" by default, so a stored
//    "USD" from those sources can't be trusted. They count only in USD
//    accounts; in any other account they are treated like foreign rows until
//    the next full re-sync stamps their real currency.
//  - Amounts are never converted and never added across currencies.

import { normalizeDataCurrency, type DataCurrency } from "@/lib/money";

export type { DataCurrency } from "@/lib/money";

/** Set by syncs that read the provider's real currency for the row. */
export const CURRENCY_VERIFIED_FIELD = "currency_verified";
/** Marks a row whose amounts were left out, holding its own currency code. */
export const CURRENCY_EXCLUDED_FIELD = "__currency_excluded";
/** Kept on an excluded row so overdue-day checks still see an open balance. */
export const OUTSTANDING_FLAG_FIELD = "__outstanding";

/** Sources that used to hard-code "USD" when the real currency wasn't read. */
const DEFAULTED_USD_SOURCES = new Set(["quickbooks", "hubspot", "zoho", "zoho_crm"]);

/** Datasets whose rows can carry money. */
const MONEY_DATASETS = ["transactions", "customers"] as const;

export type RowCurrencyStatus = "home" | "unknown" | "foreign" | "unconfirmed";

const CODE_RE = /^[A-Z]{3}$/;
const SYMBOL_CODES: Record<string, string> = { $: "USD", R: "ZAR", "€": "EUR", "£": "GBP" };

/** Normalised currency code for a row, or "" when it has none. */
export function rowCurrencyCode(row: Record<string, unknown>): string {
  const raw = String(row["currency"] ?? "").trim();
  if (!raw) return "";
  const up = raw.toUpperCase();
  if (CODE_RE.test(up)) return up;
  if (SYMBOL_CODES[raw]) return SYMBOL_CODES[raw]!;
  if (up === "US$" || up === "US DOLLAR" || up === "DOLLAR") return "USD";
  if (up === "RAND" || up === "ZA RAND") return "ZAR";
  return up.slice(0, 12);
}

function sourceOf(row: Record<string, unknown>): string {
  return String(row["__source"] ?? "").trim().toLowerCase();
}

function isVerified(row: Record<string, unknown>): boolean {
  const v = String(row[CURRENCY_VERIFIED_FIELD] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function classifyRowCurrency(
  row: Record<string, unknown>,
  account: DataCurrency,
): { status: RowCurrencyStatus; code: string } {
  const code = rowCurrencyCode(row);
  if (!code) return { status: "unknown", code };
  if (code === "USD" && DEFAULTED_USD_SOURCES.has(sourceOf(row)) && !isVerified(row)) {
    return { status: account === "USD" ? "home" : "unconfirmed", code };
  }
  return { status: code === account ? "home" : "foreign", code };
}

/** True when this row's amounts may be used for an account in `account`. */
export function amountsUsable(row: Record<string, unknown>, account: DataCurrency): boolean {
  const { status } = classifyRowCurrency(row, account);
  return status === "home" || status === "unknown";
}

// Keys that hold money. Date, day-count, id, status and currency keys never do.
const MONEY_KEY = /(amount|total|revenue|price|fee|spend|balance|subtotal|value|cost|mrr|arr|outstanding|paid_amount|payment_amount|dues|invoice_sum|net|gross)/i;
const NOT_MONEY_KEY = /(date|days|_at$|^at_|time|count|currency|_id$|^id$|status|stage|name|email|phone|probability|percent|pct|rate|score|quantity|qty|__)/i;

export function isAmountKey(key: string): boolean {
  return MONEY_KEY.test(key) && !NOT_MONEY_KEY.test(key);
}

function hasValue(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function stripAmounts(row: Record<string, string>, code: string): Record<string, string> {
  const out: Record<string, string> = { ...row, [CURRENCY_EXCLUDED_FIELD]: code || "?" };
  const due = Number(String(row["amount_due"] ?? "").replace(/[^0-9.\-]/g, ""));
  if (Number.isFinite(due) && due > 0) out[OUTSTANDING_FLAG_FIELD] = "1";
  for (const [k, v] of Object.entries(row)) {
    if (!hasValue(v)) continue;
    if (isAmountKey(k)) {
      out[k] = "";
      continue;
    }
    // Nested provider payloads stored as JSON text.
    if (typeof v === "string" && v.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(v) as Record<string, unknown>;
        let changed = false;
        const walk = (o: Record<string, unknown>) => {
          for (const [nk, nv] of Object.entries(o)) {
            if (nv && typeof nv === "object" && !Array.isArray(nv)) walk(nv as Record<string, unknown>);
            else if (isAmountKey(nk) && hasValue(nv)) {
              o[nk] = "";
              changed = true;
            }
          }
        };
        walk(parsed);
        if (changed) out[k] = JSON.stringify(parsed);
      } catch {
        // not JSON — leave as-is
      }
    }
  }
  return out;
}

export interface CurrencyExclusion {
  /** Rows whose amounts were left out. */
  excludedRows: number;
  /** Excluded rows per currency code ("?" when unconfirmed has no code). */
  byCode: Record<string, number>;
  /** Of those, rows left out only because their "USD" stamp is unconfirmed. */
  unconfirmedRows: number;
  /** Rows with no currency, counted as the account's currency. */
  assumedRows: number;
}

type Rows = Record<string, Array<Record<string, string>>>;

/**
 * Returns `data` with foreign-currency amounts blanked (rows kept), plus a
 * summary for Data Quality. When nothing is excluded the SAME object comes
 * back, so USD accounts with no foreign rows are byte-for-byte unchanged.
 */
export function applyAccountCurrency<T extends Rows>(
  data: T,
  accountCurrency: unknown,
): { data: T; exclusion: CurrencyExclusion } {
  const account = normalizeDataCurrency(accountCurrency);
  const exclusion: CurrencyExclusion = { excludedRows: 0, byCode: {}, unconfirmedRows: 0, assumedRows: 0 };
  let next: T | null = null;
  for (const key of MONEY_DATASETS) {
    const rows = data[key];
    if (!rows || rows.length === 0) continue;
    let changed: Array<Record<string, string>> | null = null;
    rows.forEach((row, i) => {
      const { status, code } = classifyRowCurrency(row, account);
      if (status === "unknown") {
        if (key === "transactions") exclusion.assumedRows++;
        return;
      }
      if (status === "home") return;
      exclusion.excludedRows++;
      if (status === "unconfirmed") exclusion.unconfirmedRows++;
      const label = status === "unconfirmed" ? `${code} (unconfirmed)` : code;
      exclusion.byCode[label] = (exclusion.byCode[label] ?? 0) + 1;
      changed ??= rows.slice();
      changed[i] = stripAmounts(row, code);
    });
    if (changed) {
      next ??= { ...data };
      (next as Rows)[key] = changed;
    }
  }
  return { data: next ?? data, exclusion };
}

/** Plain-language Data Quality line, or null when nothing is left out. */
export function describeCurrencyExclusion(e: CurrencyExclusion, account: DataCurrency): string | null {
  if (e.excludedRows === 0) return null;
  const parts = Object.entries(e.byCode)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${n} in ${code}`)
    .join(", ");
  const noun = e.excludedRows === 1 ? "record is" : "records are";
  return `${e.excludedRows} ${noun} not in your account's ${account} (${parts}) — left out of revenue totals and amount-based measures. Their dates still count.`;
}

/** Which kinds of measure still use foreign-currency rows. */
export const MEASURE_GROUPS = {
  amountBased: [
    "Revenue and revenue at risk",
    "Retention opportunity and est. saved",
    "Average order value and order-size trends",
    "Own-history and cross-customer amount comparisons",
    "Deal value",
    "Custom measures that read an amount column",
    "Overdue amount shown on the customer page",
  ],
  dateOrCountBased: [
    "Days since last purchase / payment",
    "Number of invoices, orders or deals",
    "Purchase frequency and rhythm (\"going quiet\")",
    "Payment health (days overdue)",
  ],
} as const;

// ---- Uploads: currency written inside amount cells -------------------------

const CELL_CODE_RE = /\b(USD|ZAR|EUR|GBP|AUD|CAD|NZD|INR|JPY|CHF|NGN|KES|BWP|NAD)\b/i;

/**
 * Reads a currency written inside an amount cell ("R 1,200", "ZAR 1200",
 * "US$1,200", "$1,200", "€50") and returns the bare number plus the code.
 * A bare "$" is read as USD. Returns code "" when the cell names none.
 */
export function splitMoneyCell(raw: string): { value: string; code: string } {
  const v = String(raw ?? "").trim();
  if (!v) return { value: "", code: "" };
  let code = "";
  const named = CELL_CODE_RE.exec(v);
  if (named) code = named[1]!.toUpperCase();
  else if (/US\$/i.test(v)) code = "USD";
  else if (/^\(?-?\s*R\s?\d/i.test(v) || /^-?R\s/i.test(v)) code = "ZAR";
  else if (v.includes("€")) code = "EUR";
  else if (v.includes("£")) code = "GBP";
  else if (v.includes("$")) code = "USD";
  const cleaned = v.replace(CELL_CODE_RE, "").replace(/US\$/gi, "").replace(/[R€£$\s]/gi, "");
  const neg = /^\(.*\)$/.test(cleaned);
  const body = cleaned.replace(/[()]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(body)) return { value: v, code: "" };
  return { value: neg ? `-${body}` : body, code };
}

/**
 * For one uploaded row (field → raw cell): when the row has no currency of its
 * own, take it from the first amount cell that names one. Amount cells are
 * returned as bare numbers. Rows that name two different currencies get
 * "MIXED", which never matches an account currency, so their amounts are left
 * out rather than added up.
 */
export function captureRowCurrency(
  row: Record<string, string>,
  amountFields: string[],
): Record<string, string> {
  const out = { ...row };
  const seen = new Set<string>();
  for (const f of amountFields) {
    const cell = out[f];
    if (!cell) continue;
    const { value, code } = splitMoneyCell(cell);
    out[f] = value;
    if (code) seen.add(code);
  }
  const own = rowCurrencyCode(out);
  if (own) out["currency"] = own;
  else if (seen.size === 1) out["currency"] = [...seen][0]!;
  else if (seen.size > 1) out["currency"] = "MIXED";
  return out;
}
