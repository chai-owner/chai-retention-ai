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
