// Pure seat-locking rules used when a workspace downgrades to a plan with
// fewer seats. No owner picker: members go first, then admins, and within a
// role the most recently joined seat is the first out.

import type { OrgRole } from "@/lib/organisations";

export interface LockCandidate {
  id: string;
  role: OrgRole;
  /** ISO timestamp of when the seat was invited/created. */
  invitedAt: string;
  locked?: boolean;
  lockedAt?: string | null;
}

const ROLE_ORDER: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

function time(value: string | null | undefined): number {
  const t = value ? new Date(value).getTime() : NaN;
  return isNaN(t) ? 0 : t;
}

/**
 * Members to lock so the workspace fits `seatsAllowed`. The owner is never
 * locked. Returns ids in the order they should be locked.
 */
export function selectMembersToLock(
  members: LockCandidate[],
  seatsAllowed: number | null,
): string[] {
  if (seatsAllowed === null) return [];
  const active = members.filter((m) => !m.locked);
  const excess = active.length - seatsAllowed;
  if (excess <= 0) return [];

  const lockable = active
    .filter((m) => m.role !== "owner")
    .sort((a, b) => {
      const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (byRole !== 0) return byRole;
      // Most recently joined leaves first.
      return time(b.invitedAt) - time(a.invitedAt);
    });

  return lockable.slice(0, excess).map((m) => m.id);
}

/**
 * Members to restore after an upgrade: reverse order of locking, i.e. the most
 * recently locked seat comes back first.
 */
export function selectMembersToUnlock(
  members: LockCandidate[],
  seatsAllowed: number | null,
): string[] {
  const locked = members.filter((m) => m.locked);
  if (locked.length === 0) return [];
  const activeCount = members.length - locked.length;
  const slots = seatsAllowed === null ? locked.length : Math.max(0, seatsAllowed - activeCount);
  if (slots === 0) return [];

  return locked
    .slice()
    .sort((a, b) => time(b.lockedAt) - time(a.lockedAt))
    .slice(0, slots)
    .map((m) => m.id);
}
