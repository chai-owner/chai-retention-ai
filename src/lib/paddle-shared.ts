// Shared Paddle <-> ChAi plan mapping. Pure and framework-free so it can be
// imported by client code, server functions, the webhook handler and tests.

import { ORG_PLANS, type BillingPeriod, type OrgPlan } from "@/lib/organisations";

/**
 * Human-readable Paddle price external IDs. These are stable across the test
 * and live environments; server code resolves them to `pri_` IDs at call time.
 */
export const PLAN_PRICE_IDS: Record<OrgPlan, Record<BillingPeriod, string>> = {
  core: {
    monthly: "pri_01m1mfs0jpqzctfeejjb2qbsmy",
    annual: "pri_01m1mfs0vz3n2spp99n0825j0r",
  },
  standard: {
    monthly: "pri_01m1mfs1b0rpm8s5eprn0sggcf",
    annual: "pri_01m1mfs1vz4fjt2cg5j4nb6mkw",
  },
  enterprise: {
    monthly: "pri_01m1mfs2cavrew542dscww9396",
    annual: "pri_01m1mfs2mmq3sj64ykbbhxca3x",
  },
};

/** Smart Ingest ("Data Drop") add-on price. Monthly billing only. */
export const ADDON_PRICE_ID = "pri_01m1mfs32g8k29pf1q2scjtyh0";
export const ADDON_PRODUCT_ID = "smart_ingest_addon";

/** Product external ID -> ChAi plan slug. */
export const PRODUCT_TO_PLAN: Record<string, OrgPlan> = {
  core_plan: "core",
  standard_plan: "standard",
  enterprise_plan: "enterprise",
};

/**
 * Price ID -> plan + billing period. Accepts both Paddle price IDs (what the
 * webhook sees today) and the legacy human-readable external IDs.
 */
export const PRICE_TO_PLAN_PERIOD: Record<string, { plan: OrgPlan; period: BillingPeriod }> = {
  [PLAN_PRICE_IDS.core.monthly]: { plan: "core", period: "monthly" },
  [PLAN_PRICE_IDS.core.annual]: { plan: "core", period: "annual" },
  [PLAN_PRICE_IDS.standard.monthly]: { plan: "standard", period: "monthly" },
  [PLAN_PRICE_IDS.standard.annual]: { plan: "standard", period: "annual" },
  [PLAN_PRICE_IDS.enterprise.monthly]: { plan: "enterprise", period: "monthly" },
  [PLAN_PRICE_IDS.enterprise.annual]: { plan: "enterprise", period: "annual" },
  core_monthly: { plan: "core", period: "monthly" },
  core_annual: { plan: "core", period: "annual" },
  standard_monthly: { plan: "standard", period: "monthly" },
  standard_annual: { plan: "standard", period: "annual" },
  enterprise_monthly: { plan: "enterprise", period: "monthly" },
  enterprise_annual: { plan: "enterprise", period: "annual" },
};

export function planForProduct(externalId: string | null | undefined): OrgPlan | null {
  return externalId ? (PRODUCT_TO_PLAN[externalId] ?? null) : null;
}

export function planPeriodForPrice(
  externalId: string | null | undefined,
): { plan: OrgPlan; period: BillingPeriod } | null {
  return externalId ? (PRICE_TO_PLAN_PERIOD[externalId] ?? null) : null;
}

export type PlanChangeKind = "upgrade-now" | "downgrade-renewal" | "same";

/**
 * Business rule: upgrades (higher tier, or monthly -> annual on the same tier)
 * apply immediately with prorated billing. Downgrades (lower tier, or
 * annual -> monthly) take effect at the next billing period.
 */
export function planChangeKind(
  currentPlan: OrgPlan,
  currentPeriod: BillingPeriod,
  targetPlan: OrgPlan,
  targetPeriod: BillingPeriod,
): PlanChangeKind {
  if (currentPlan === targetPlan && currentPeriod === targetPeriod) return "same";
  const tierUp = ORG_PLANS.indexOf(targetPlan) > ORG_PLANS.indexOf(currentPlan);
  const tierDown = ORG_PLANS.indexOf(targetPlan) < ORG_PLANS.indexOf(currentPlan);
  if (tierUp) return "upgrade-now";
  if (tierDown) return "downgrade-renewal";
  // Same tier: moving to annual commits more revenue -> immediate; the reverse waits.
  return targetPeriod === "annual" ? "upgrade-now" : "downgrade-renewal";
}

/** True when a pending downgrade has reached its effective date. */
export function pendingChangeDue(effectiveAt: string | null | undefined, now = new Date()): boolean {
  if (!effectiveAt) return false;
  const at = new Date(effectiveAt);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}
