// Pure, framework-free organisation rules: plans, seat limits, roles and
// invite expiry. Kept free of server/browser imports so it can be unit tested
// and reused by both the UI and the server functions.

export type OrgPlan = "core" | "standard" | "enterprise";
export type OrgRole = "owner" | "admin" | "member";
export type InviteRole = Exclude<OrgRole, "owner">;

export const ORG_PLANS: OrgPlan[] = ["core", "standard", "enterprise"];
export const ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];

/** Legacy plan slugs stored before the Core/Standard/Enterprise rename. */
const LEGACY_PLANS: Record<string, OrgPlan> = {
  starter: "core",
  growth: "standard",
  pro: "enterprise",
};

/** Maps any stored value (including legacy slugs) onto a current plan. */
export function coercePlan(value: unknown): OrgPlan {
  if (isOrgPlan(value)) return value;
  if (typeof value === "string" && LEGACY_PLANS[value]) return LEGACY_PLANS[value]!;
  return "core";
}

/** Seats included with each plan. `null` means unlimited. */
export const PLAN_SEATS: Record<OrgPlan, number | null> = {
  core: 1,
  standard: 5,
  enterprise: null,
};

/** Customer records included with each plan. `null` means unlimited. */
export const PLAN_CUSTOMERS: Record<OrgPlan, number | null> = {
  core: 250,
  standard: 1500,
  enterprise: null,
};

export type BillingPeriod = "monthly" | "annual";

/** Annual billing is 10% off the monthly rate, charged as one payment. */
export const ANNUAL_DISCOUNT = 0.1;

export interface PlanPricing {
  /** Price per month when billed monthly, in whole dollars. */
  monthly: number;
  /** Effective per-month price when billed annually. */
  annualMonthly: number;
  /** Single annual payment. */
  annualTotal: number;
}

export const PLAN_PRICING: Record<OrgPlan, PlanPricing> = {
  core: { monthly: 99, annualMonthly: 89, annualTotal: 1069 },
  standard: { monthly: 249, annualMonthly: 224, annualTotal: 2689 },
  enterprise: { monthly: 599, annualMonthly: 539, annualTotal: 6469 },
};

/** Dollars saved per year by paying annually instead of monthly. */
export function annualSaving(plan: OrgPlan): number {
  const p = PLAN_PRICING[plan];
  return p.monthly * 12 - p.annualTotal;
}

export function planPriceLabel(plan: OrgPlan, period: BillingPeriod): string {
  const p = PLAN_PRICING[plan];
  return period === "annual" ? `$${p.annualMonthly}/mo` : `$${p.monthly}/mo`;
}

/** The tier a plan upgrades to, or `null` when already on the top tier. */
export function nextPlan(plan: OrgPlan): OrgPlan | null {
  const i = ORG_PLANS.indexOf(plan);
  return i >= 0 && i < ORG_PLANS.length - 1 ? ORG_PLANS[i + 1]! : null;
}


export function customersAllowed(plan: OrgPlan): number | null {
  return PLAN_CUSTOMERS[plan];
}

/** How many more customers the plan allows. `null` means unlimited. */
export function customerHeadroom(plan: OrgPlan, current: number): number | null {
  const allowed = customersAllowed(plan);
  return allowed === null ? null : Math.max(0, allowed - current);
}

/** True when adding `incoming` new customers stays inside the plan limit. */
export function hasCustomerCapacity(plan: OrgPlan, current: number, incoming = 0): boolean {
  const allowed = customersAllowed(plan);
  return allowed === null || current + incoming <= allowed;
}

/** Show the 80% warning banner once usage reaches 80% of a finite limit. */
export function shouldWarnCustomerLimit(plan: OrgPlan, current: number): boolean {
  const allowed = customersAllowed(plan);
  return allowed !== null && allowed > 0 && current / allowed >= 0.8;
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


export const PLAN_LABELS: Record<OrgPlan, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const INVITE_TTL_DAYS = 7;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export function isOrgPlan(value: unknown): value is OrgPlan {
  return typeof value === "string" && (ORG_PLANS as string[]).includes(value);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as string[]).includes(value);
}

export function seatsAllowed(plan: OrgPlan): number | null {
  return PLAN_SEATS[plan];
}

/** "3 / 5 seats used" — or "3 seats used" when the plan is unlimited. */
export function seatsLabel(plan: OrgPlan, used: number): string {
  const allowed = seatsAllowed(plan);
  return allowed === null ? `${used} seats used (unlimited)` : `${used} / ${allowed} seats used`;
}

/**
 * A seat is consumed by every accepted member plus every invite that is still
 * outstanding, so a team can never over-invite past its plan.
 */
export function seatsUsed(memberCount: number, pendingInviteCount = 0): number {
  return memberCount + pendingInviteCount;
}

export function hasSeatAvailable(plan: OrgPlan, used: number): boolean {
  const allowed = seatsAllowed(plan);
  return allowed === null || used < allowed;
}

// --- Permissions -------------------------------------------------------------

/** Owners and admins can invite, change roles and remove members. */
export function canManageMembers(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canManageIntegrations(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Members have no access to settings; admins do (but not billing). */
export function canViewSettings(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Billing is owner-only. */
export function canViewBilling(role: OrgRole | null | undefined): boolean {
  return role === "owner";
}

export interface RoleChangeCheck {
  allowed: boolean;
  reason?: string;
}

/** The owner row is immutable: it can never be demoted, nor can it be granted. */
export function canChangeRole(
  actorRole: OrgRole | null | undefined,
  targetRole: OrgRole,
  nextRole: OrgRole,
): RoleChangeCheck {
  if (!canManageMembers(actorRole)) return { allowed: false, reason: "You don't have permission to change roles." };
  if (targetRole === "owner") return { allowed: false, reason: "The owner's role can't be changed." };
  if (nextRole === "owner") return { allowed: false, reason: "Ownership can't be granted from this screen." };
  return { allowed: true };
}

export function canRemoveMember(
  actorRole: OrgRole | null | undefined,
  targetRole: OrgRole,
): RoleChangeCheck {
  if (!canManageMembers(actorRole)) return { allowed: false, reason: "You don't have permission to remove members." };
  if (targetRole === "owner") return { allowed: false, reason: "The owner can't be removed." };
  return { allowed: true };
}

// --- Invites -----------------------------------------------------------------

export function inviteExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

export function isInviteExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const at = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return !(at.getTime() > now.getTime());
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliseEmail(email));
}

export function inviteAcceptUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/invite/${token}`;
}
