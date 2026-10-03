// Ported verbatim from src/lib/paddle-shared.ts (only what plan-changes needs).
import { ORG_PLANS, type BillingPeriod, type OrgPlan } from "./organisations.ts";

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
  elite: { monthly: "", annual: "" },
};

export function pendingChangeDue(effectiveAt: string | null | undefined, now = new Date()): boolean {
  if (!effectiveAt) return false;
  const at = new Date(effectiveAt);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}

// Re-exported for callers that only import from this module (mirrors the
// original file's re-export of ORG_PLANS indirectly via organisations.ts).
export { ORG_PLANS };
