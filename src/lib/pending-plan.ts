// Remembers the plan a visitor picked on the pricing page before they signed
// up, so the trial-expiry paywall can pre-select it after onboarding.
import type { BillingPeriod, OrgPlan } from "@/lib/organisations";

const KEY = "chai.pending-plan";

export type PendingPlan = { plan: OrgPlan; period: BillingPeriod; addon?: boolean };

const PLANS = new Set(["core", "standard", "enterprise", "elite"]);

export function storePendingPlan(selection: PendingPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(selection));
  } catch {
    // storage unavailable (private mode) — selection simply isn't remembered
  }
}

export function readPendingPlan(): PendingPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPlan>;
    if (!parsed || typeof parsed.plan !== "string" || !PLANS.has(parsed.plan)) return null;
    const period: BillingPeriod = parsed.period === "annual" ? "annual" : "monthly";
    return { plan: parsed.plan as OrgPlan, period, addon: !!parsed.addon };
  } catch {
    return null;
  }
}

export function clearPendingPlan(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
