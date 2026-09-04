// Promo codes. Pure and framework-free so both the pricing page, the
// expired-trial paywall and the server side can share one definition.
import type { OrgPlan } from "@/lib/organisations";

/** The Founder Plan invite code: Standard at the Core price. */
export const FOUNDER_CODE = "8AKBV6Y1BN";
export const FOUNDER_PLAN: OrgPlan = "standard";
/** Monthly price a Founder Plan customer pays for Standard. */
export const FOUNDER_MONTHLY_PRICE = 99;

export const FOUNDER_SUCCESS_MESSAGE =
  "🎉 Founder Plan unlocked! You're getting Standard at $99/mo.";
export const PROMO_INVALID_MESSAGE =
  "That code isn't valid. Check the spelling and try again.";
export const FOUNDER_BANNER_MESSAGE =
  "You have a Founder Plan offer waiting — Standard at $99/mo.";

/** sessionStorage key used by the /founder invite link. */
export const PROMO_STORAGE_KEY = "chai.promo-code";

export function normalisePromoCode(input: string | null | undefined): string {
  return (input ?? "").trim().toUpperCase();
}

export function isFounderCode(input: string | null | undefined): boolean {
  return normalisePromoCode(input) === FOUNDER_CODE;
}

/** Returns the canonical code when valid, otherwise null. */
export function validatePromoCode(input: string | null | undefined): string | null {
  return isFounderCode(input) ? FOUNDER_CODE : null;
}

export function storePromoCode(code: string) {
  try {
    sessionStorage.setItem(PROMO_STORAGE_KEY, normalisePromoCode(code));
  } catch {
    /* storage unavailable — the code can still be typed manually */
  }
}

export function readStoredPromoCode(): string | null {
  try {
    return validatePromoCode(sessionStorage.getItem(PROMO_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredPromoCode() {
  try {
    sessionStorage.removeItem(PROMO_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
