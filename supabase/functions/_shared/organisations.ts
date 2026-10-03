// Ported verbatim (logic unchanged) from src/lib/organisations.ts.
// Only the pure rules needed by the cron jobs are included.

export type OrgPlan = "core" | "standard" | "enterprise" | "elite";
export type OrgRole = "owner" | "admin" | "member";

export const ORG_PLANS: OrgPlan[] = ["core", "standard", "enterprise", "elite"];

const LEGACY_PLANS: Record<string, OrgPlan> = {
  starter: "core",
  growth: "standard",
  pro: "enterprise",
};

export function isOrgPlan(value: unknown): value is OrgPlan {
  return typeof value === "string" && (ORG_PLANS as string[]).includes(value);
}

export function coercePlan(value: unknown): OrgPlan {
  if (isOrgPlan(value)) return value;
  if (typeof value === "string" && LEGACY_PLANS[value]) return LEGACY_PLANS[value]!;
  return "core";
}

export const PLAN_SEATS: Record<OrgPlan, number | null> = {
  core: 1,
  standard: 5,
  enterprise: 10,
  elite: null,
};

export const PLAN_CUSTOMERS: Record<OrgPlan, number | null> = {
  core: 250,
  standard: 1500,
  enterprise: 10000,
  elite: null,
};

export type BillingPeriod = "monthly" | "annual";

export const PLAN_LABELS: Record<OrgPlan, string> = {
  core: "Core",
  standard: "Standard",
  enterprise: "Enterprise",
  elite: "Elite",
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function customersAllowed(plan: OrgPlan): number | null {
  return PLAN_CUSTOMERS[plan];
}

export function customerLimitMessage(plan: OrgPlan, current: number, incoming: number): string {
  const allowed = customersAllowed(plan) ?? 0;
  return (
    `This import would take you to ${(current + incoming).toLocaleString()} customers, ` +
    `but the ${PLAN_LABELS[plan]} plan includes ${allowed.toLocaleString()}. ` +
    `You currently have ${current.toLocaleString()}. Nothing was imported — ` +
    `upgrade your plan to continue.`
  );
}

export function seatsAllowed(plan: OrgPlan): number | null {
  return PLAN_SEATS[plan];
}
