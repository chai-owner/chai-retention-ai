// Ported verbatim from src/lib/seat-locking.ts.
import type { OrgRole } from "./organisations.ts";

export interface LockCandidate {
  id: string;
  role: OrgRole;
  invitedAt: string;
  locked?: boolean;
  lockedAt?: string | null;
}

const ROLE_ORDER: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

function time(value: string | null | undefined): number {
  const t = value ? new Date(value).getTime() : NaN;
  return isNaN(t) ? 0 : t;
}

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
      return time(b.invitedAt) - time(a.invitedAt);
    });

  return lockable.slice(0, excess).map((m) => m.id);
}

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
