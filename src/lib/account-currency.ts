// The signed-in account's data currency, read from the business profile.
// Signed-out visitors (and the public demo) always get USD.
import { profileStore, useProfile } from "@/lib/profile-store";
import { normalizeDataCurrency, type DataCurrency } from "@/lib/money";

export function accountCurrency(): DataCurrency {
  return normalizeDataCurrency(profileStore.getSnapshot()?.dataCurrency);
}

export function useAccountCurrency(): DataCurrency {
  return normalizeDataCurrency(useProfile()?.dataCurrency);
}

import { classifyRowCurrency } from "@/lib/currency-rules";
import { formatForeignAmount, formatMoney } from "@/lib/money";

/**
 * One stored amount, labelled honestly: in the account's format when the row
 * is in the account currency (or has none), otherwise with its own code
 * ("USD 1,200") so it is never mistaken for — or added to — account money.
 */
export function formatRowAmount(
  n: number,
  row: Record<string, unknown>,
  currency: DataCurrency = accountCurrency(),
): string {
  const { status, code } = classifyRowCurrency(row, currency);
  if (status === "home" || status === "unknown") return formatMoney(n, currency);
  return formatForeignAmount(n, code || "?");
}
