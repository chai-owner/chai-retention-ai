// Decides whether to suggest switching the account's data currency, based on
// the base currencies of connected Xero / QuickBooks organisations. Suggests
// only — never switches. Xero can sync several organisations: the switch is
// suggested only when every connected organisation agrees.
import { isDataCurrency, type DataCurrency } from "@/lib/money";

export interface ConnectionCurrencies {
  provider: string;
  tenant_currencies?: Record<string, { name?: string; currency?: string }> | null;
}

export type CurrencySuggestion =
  | { kind: "suggest"; currency: DataCurrency; orgs: Array<{ name: string; currency: string }> }
  | { kind: "note"; message: string; orgs: Array<{ name: string; currency: string }> }
  | null;

const PROVIDER_NAMES: Record<string, string> = { xero: "Xero", quickbooks: "QuickBooks" };

export function currencySuggestion(
  connections: ConnectionCurrencies[],
  account: DataCurrency,
  dismissed: string | null | undefined,
): CurrencySuggestion {
  const orgs: Array<{ name: string; currency: string }> = [];
  for (const c of connections) {
    if (!PROVIDER_NAMES[c.provider]) continue;
    for (const o of Object.values(c.tenant_currencies ?? {})) {
      const currency = String(o?.currency ?? "").trim().toUpperCase();
      if (currency) orgs.push({ name: String(o?.name || PROVIDER_NAMES[c.provider]), currency });
    }
  }
  if (orgs.length === 0) return null;
  const codes = [...new Set(orgs.map((o) => o.currency))];
  if (codes.length > 1) {
    const list = orgs.map((o) => `${o.name} (${o.currency})`).join(", ");
    return {
      kind: "note",
      message: `Your connected organisations use different currencies: ${list}. ChAi keeps your data currency as ${account}; amounts in other currencies are left out of revenue totals.`,
      orgs,
    };
  }
  const only = codes[0]!;
  if (only === account) return null;
  if (!isDataCurrency(only)) {
    return {
      kind: "note",
      message: `Your connected organisation uses ${only}. ChAi currently supports USD and ZAR, so amounts in ${only} are left out of revenue totals.`,
      orgs,
    };
  }
  if (dismissed === only) return null;
  return { kind: "suggest", currency: only, orgs };
}
