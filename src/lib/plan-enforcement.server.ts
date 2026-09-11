// Applies a workspace's plan limits without ever deleting anything:
//   * customers beyond the plan's allowance are paused (lowest health first)
//   * seats beyond the plan's allowance are locked (members, then admins)
// Both are reversible: upgrading unpauses and unlocks again.
import * as React from "react";

import {
  PLAN_LABELS,
  ROLE_LABELS,
  coercePlan,
  customersAllowed,
  seatsAllowed,
  type OrgPlan,
  type OrgRole,
} from "@/lib/organisations";
import { selectMembersToLock, selectMembersToUnlock, type LockCandidate } from "@/lib/seat-locking";
import { queueTransactionalEmail } from "@/lib/transactional-email.server";

type AdminClient = any;

const PAGE = 1000;
const CHUNK = 200;

async function allCustomerIds(admin: AdminClient, userId: string) {
  const rows: Array<{ id: string; customer_id: string; paused: boolean; created_at?: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("ingested_customers")
      .select("id, customer_id, paused, created_at")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function setPaused(admin: AdminClient, ids: string[], paused: boolean) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await admin
      .from("ingested_customers")
      .update({ paused })
      .in("id", ids.slice(i, i + CHUNK));
  }
}

/**
 * Keeps the healthiest-scoring `allowed` customers active for one user and
 * pauses the rest. Paused customers keep all their rows; they're simply hidden
 * from scoring and the app until the workspace upgrades again.
 */
export async function applyCustomerPausing(
  admin: AdminClient,
  userId: string,
  plan: OrgPlan,
): Promise<{ paused: number; resumed: number }> {
  const allowed = customersAllowed(plan);
  const rows = await allCustomerIds(admin, userId);
  if (rows.length === 0) return { paused: 0, resumed: 0 };

  if (allowed === null || rows.length <= allowed) {
    const toResume = rows.filter((r) => r.paused).map((r) => r.id);
    await setPaused(admin, toResume, false);
    return { paused: 0, resumed: toResume.length };
  }

  const { data: scores } = await admin
    .from("customer_scores")
    .select("customer_id, score")
    .eq("user_id", userId)
    .eq("is_latest", true);
  const scoreBy = new Map<string, number>(
    ((scores ?? []) as Array<{ customer_id: string; score: number }>).map((s) => [
      s.customer_id,
      Number(s.score) || 0,
    ]),
  );

  const ranked = rows
    .slice()
    .sort((a, b) => (scoreBy.get(b.customer_id) ?? -1) - (scoreBy.get(a.customer_id) ?? -1));
  const keep = ranked.slice(0, allowed);
  const drop = ranked.slice(allowed);

  const toPause = drop.filter((r) => !r.paused).map((r) => r.id);
  const toResume = keep.filter((r) => r.paused).map((r) => r.id);
  await setPaused(admin, toPause, true);
  await setPaused(admin, toResume, false);

  // Paused customers shouldn't appear in the risk table or Today screen, both
  // of which read the score snapshots directly.
  const pausedCustomerIds = drop.map((r) => r.customer_id);
  for (let i = 0; i < pausedCustomerIds.length; i += CHUNK) {
    await admin
      .from("customer_scores")
      .delete()
      .eq("user_id", userId)
      .in("customer_id", pausedCustomerIds.slice(i, i + CHUNK));
  }

  return { paused: toPause.length, resumed: toResume.length };
}

interface MemberRow {
  id: string;
  user_id: string;
  role: OrgRole;
  invited_at: string;
  locked: boolean;
  locked_at: string | null;
}

async function loadMembers(admin: AdminClient, orgId: string): Promise<MemberRow[]> {
  const { data } = await admin
    .from("organisation_members")
    .select("id, user_id, role, invited_at, locked, locked_at")
    .eq("org_id", orgId);
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: (m.role ?? "member") as OrgRole,
    invited_at: m.invited_at ?? m.created_at ?? new Date(0).toISOString(),
    locked: Boolean(m.locked),
    locked_at: m.locked_at ?? null,
  }));
}

function toCandidates(members: MemberRow[]): LockCandidate[] {
  return members.map((m) => ({
    id: m.id,
    role: m.role,
    invitedAt: m.invited_at,
    locked: m.locked,
    lockedAt: m.locked_at,
  }));
}

async function profilesFor(admin: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { full_name?: string; email?: string }>();
  const { data } = await admin.from("profiles").select("id, full_name, email").in("id", userIds);
  return new Map<string, { full_name?: string; email?: string }>(
    ((data ?? []) as any[]).map((p) => [p.id, p]),
  );
}

/** Locks or restores seats so the member count fits the plan. */
export async function applySeatLocking(
  admin: AdminClient,
  orgId: string,
  plan: OrgPlan,
  organisationName: string,
): Promise<{ locked: number; unlocked: number }> {
  const members = await loadMembers(admin, orgId);
  const allowed = seatsAllowed(plan);
  const candidates = toCandidates(members);

  const lockIds = selectMembersToLock(candidates, allowed);
  const unlockIds = lockIds.length === 0 ? selectMembersToUnlock(candidates, allowed) : [];

  if (unlockIds.length > 0) {
    await admin
      .from("organisation_members")
      .update({ locked: false, locked_at: null })
      .in("id", unlockIds);
  }

  if (lockIds.length > 0) {
    const now = new Date().toISOString();
    await admin
      .from("organisation_members")
      .update({ locked: true, locked_at: now })
      .in("id", lockIds);

    const affected = members.filter((m) => lockIds.includes(m.id));
    const owner = members.find((m) => m.role === "owner");
    const profiles = await profilesFor(
      admin,
      affected.map((m) => m.user_id).concat(owner ? [owner.user_id] : []),
    );
    const ownerEmail = owner ? profiles.get(owner.user_id)?.email : undefined;
    const { SeatLockedEmail } = await import("@/lib/email-templates/seat-locked");
    for (const member of affected) {
      const email = profiles.get(member.user_id)?.email;
      if (!email) continue;
      await queueTransactionalEmail(admin, {
        to: email,
        subject: "Your ChAi access has changed",
        template: "seat_locked",
        element: React.createElement(SeatLockedEmail, { organisationName, ownerEmail }),
      });
    }
  }

  return { locked: lockIds.length, unlocked: unlockIds.length };
}

/**
 * Full enforcement pass for one workspace: seats first (so the member list is
 * settled), then each remaining member's customer records.
 */
export async function applyPlanEnforcement(
  admin: AdminClient,
  orgId: string,
): Promise<{ locked: number; unlocked: number; paused: number; resumed: number }> {
  const { data: org } = await admin
    .from("organisations")
    .select("id, name, plan, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { locked: 0, unlocked: 0, paused: 0, resumed: 0 };

  const { trialState, effectivePlan } = await import("@/lib/trials");
  const plan = effectivePlan(coercePlan(org.plan), trialState(org.trial_ends_at));

  const seats = await applySeatLocking(admin, orgId, plan, org.name || "your workspace");
  const members = await loadMembers(admin, orgId);
  let paused = 0;
  let resumed = 0;
  for (const member of members) {
    if (member.locked) continue;
    const result = await applyCustomerPausing(admin, member.user_id, plan);
    paused += result.paused;
    resumed += result.resumed;
  }
  return { ...seats, paused, resumed };
}

/** Owner-facing warning listing exactly who loses their seat on a downgrade. */
export async function sendDowngradeSeatWarning(
  admin: AdminClient,
  orgId: string,
  targetPlan: OrgPlan,
  effectiveAt: string,
): Promise<boolean> {
  const { data: org } = await admin
    .from("organisations")
    .select("id, name, owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return false;

  const members = await loadMembers(admin, orgId);
  const lockIds = selectMembersToLock(toCandidates(members), seatsAllowed(targetPlan));
  if (lockIds.length === 0) return false;

  const profiles = await profilesFor(admin, members.map((m) => m.user_id));
  const ownerEmail = profiles.get(org.owner_id)?.email;
  if (!ownerEmail) return false;

  const affected = members
    .filter((m) => lockIds.includes(m.id))
    .map((m) => ({
      name: profiles.get(m.user_id)?.full_name ?? "",
      email: profiles.get(m.user_id)?.email ?? "",
      roleLabel: ROLE_LABELS[m.role],
    }));

  const { SeatLockWarningEmail } = await import("@/lib/email-templates/seat-lock-warning");
  return queueTransactionalEmail(admin, {
    to: ownerEmail,
    subject: "Seats that will be locked when your plan changes",
    template: "seat_lock_warning",
    element: React.createElement(SeatLockWarningEmail, {
      organisationName: org.name || "Your workspace",
      planLabel: PLAN_LABELS[targetPlan],
      effectiveDate: new Date(effectiveAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      affected,
      billingUrl: "https://chai-retention-ai.lovable.app/settings/account",
    }),
  });
}
