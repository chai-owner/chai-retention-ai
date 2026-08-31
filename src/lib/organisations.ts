// Pure, framework-free organisation rules: plans, seat limits, roles and
// invite expiry. Kept free of server/browser imports so it can be unit tested
// and reused by both the UI and the server functions.

export type OrgPlan = "starter" | "growth" | "pro";
export type OrgRole = "owner" | "admin" | "member";
export type InviteRole = Exclude<OrgRole, "owner">;

export const ORG_PLANS: OrgPlan[] = ["starter", "growth", "pro"];
export const ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];

/** Seats included with each plan. `null` means unlimited. */
export const PLAN_SEATS: Record<OrgPlan, number | null> = {
  starter: 1,
  growth: 5,
  pro: null,
};

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
