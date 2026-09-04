import { describe, expect, it } from "vitest";
import { selectMembersToLock, selectMembersToUnlock, type LockCandidate } from "@/lib/seat-locking";

const members: LockCandidate[] = [
  { id: "owner", role: "owner", invitedAt: "2026-01-01T00:00:00Z" },
  { id: "admin-old", role: "admin", invitedAt: "2026-02-01T00:00:00Z" },
  { id: "admin-new", role: "admin", invitedAt: "2026-06-01T00:00:00Z" },
  { id: "member-old", role: "member", invitedAt: "2026-03-01T00:00:00Z" },
  { id: "member-new", role: "member", invitedAt: "2026-07-01T00:00:00Z" },
];

describe("selectMembersToLock", () => {
  it("locks nothing when the plan is unlimited or has room", () => {
    expect(selectMembersToLock(members, null)).toEqual([]);
    expect(selectMembersToLock(members, 5)).toEqual([]);
  });

  it("locks members before admins, newest first", () => {
    expect(selectMembersToLock(members, 3)).toEqual(["member-new", "member-old"]);
  });

  it("never locks the owner", () => {
    expect(selectMembersToLock(members, 1)).toEqual([
      "member-new",
      "member-old",
      "admin-new",
      "admin-old",
    ]);
  });
});

describe("selectMembersToUnlock", () => {
  const locked: LockCandidate[] = [
    { id: "owner", role: "owner", invitedAt: "2026-01-01T00:00:00Z" },
    { id: "a", role: "member", invitedAt: "2026-03-01T00:00:00Z", locked: true, lockedAt: "2026-08-01T00:00:00Z" },
    { id: "b", role: "member", invitedAt: "2026-04-01T00:00:00Z", locked: true, lockedAt: "2026-09-01T00:00:00Z" },
  ];

  it("restores the most recently locked seat first", () => {
    expect(selectMembersToUnlock(locked, 2)).toEqual(["b"]);
  });

  it("restores everyone when the plan is unlimited", () => {
    expect(selectMembersToUnlock(locked, null)).toEqual(["b", "a"]);
  });

  it("restores nobody when there is no room", () => {
    expect(selectMembersToUnlock(locked, 1)).toEqual([]);
  });
});
