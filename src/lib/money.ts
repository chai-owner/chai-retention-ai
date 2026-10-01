// Single money formatter for customer data. The account's data currency only
// changes the label and formatting — amounts are never converted.
//
// USD output is byte-for-byte what the app has always shown ("$12,500",
// "-$1,200", "$0", compact "$1M" from a million). ZAR uses "R", a space and the
// same digits ("R 12,500", "-R 1,200", "R 0", "R 1M").
//
// ChAi's own subscription prices (Paddle) and the public homepage demo are
// always USD and must call formatMoney(n, "USD") explicitly, never the account
// currency.

export const DATA_CURRENCIES = ["USD", "ZAR"] as const;
export type DataCurrency = (typeof DATA_CURRENCIES)[number];
export const DEFAULT_DATA_CURRENCY: DataCurrency = "USD";

export const DATA_CURRENCY_LABELS: Record<DataCurrency, string> = {
  USD: "US dollar (USD, $)",
  ZAR: "South African rand (ZAR, R)",
};

export function isDataCurrency(v: unknown): v is DataCurrency {
  return typeof v === "string" && (DATA_CURRENCIES as readonly string[]).includes(v);
}

/** Anything unknown or missing falls back to USD (existing accounts). */
export function normalizeDataCurrency(v: unknown): DataCurrency {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return isDataCurrency(s) ? s : DEFAULT_DATA_CURRENCY;
}

export function currencySymbol(currency: DataCurrency): string {
  return currency === "ZAR" ? "R" : "$";
}

export interface MoneyOptions {
  /** Show this many decimals (e.g. 2 for cents). Default: whole units. */
  decimals?: number;
}

export function formatMoney(n: number, currency: DataCurrency, opts: MoneyOptions = {}): string {
  const decimals = opts.decimals;
  const notation = n >= 1_000_000 ? "compact" : "standard";
  if (currency === "USD") {
    // Exactly the formatter the app used before the currency setting existed.
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      ...(decimals == null
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
      notation,
    }).format(n);
  }
  // Same digits and sign handling as USD, with the rand symbol and a space.
  const digits = new Intl.NumberFormat("en-US", {
    ...(decimals == null
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    notation,
  }).format(n);
  const sym = currencySymbol(currency);
  return digits.startsWith("-") ? `-${sym} ${digits.slice(1)}` : `${sym} ${digits}`;
}

/** A foreign-currency amount, labelled with its own code ("USD 1,200"). */
export function formatForeignAmount(n: number, code: string): string {
  const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  return digits.startsWith("-") ? `-${code} ${digits.slice(1)}` : `${code} ${digits}`;
}

/** Compact chart-axis tick: "$12k" / "R 12k". */
export function formatMoneyTick(v: number, currency: DataCurrency): string {
  const sym = currencySymbol(currency);
  const sep = currency === "USD" ? "" : " ";
  return `${sym}${sep}${Math.round(v / 1000)}k`;
}
