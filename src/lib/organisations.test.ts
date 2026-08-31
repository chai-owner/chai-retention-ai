import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_DAYS,
  canChangeRole,
  canManageIntegrations,
  canManageMembers,
  canRemoveMember,
  canViewBilling,
  canViewSettings,
  hasSeatAvailable,
  inviteAcceptUrl,
  inviteExpiryFrom,
  isInviteExpired,
  isOrgPlan,
  isOrgRole,
  isValidEmail,
  normaliseEmail,
  seatsAllowed,
  seatsLabel,
  seatsUsed,
} from "@/lib/organisations";

describe("plans and seats", () => {
  it("maps plans to seat limits", () => {
    expect(seatsAllowed("starter")).toBe(1);
    expect(seatsAllowed("growth")).toBe(5);
    expect(seatsAllowed("pro")).toBeNull();
  });

  it("counts accepted members plus pending invites", () => {
    expect(seatsUsed(3)).toBe(3);
    expect(seatsUsed(3, 2)).toBe(5);
  });

  it("blocks invites once the plan seats are full", () => {
    expect(hasSeatAvailable("starter", 0)).toBe(true);
    expect(hasSeatAvailable("starter", 1)).toBe(false);
    expect(hasSeatAvailable("growth", 4)).toBe(true);
    expect(hasSeatAvailable("growth", 5)).toBe(false);
    expect(hasSeatAvailable("pro", 5000)).toBe(true);
  });

  it("labels seat usage", () => {
    expect(seatsLabel("growth", 3)).toBe("3 / 5 seats used");
    expect(seatsLabel("pro", 3)).toBe("3 seats used (unlimited)");
  });

  it("validates plan and role values", () => {
    expect(isOrgPlan("growth")).toBe(true);
    expect(isOrgPlan("enterprise")).toBe(false);
    expect(isOrgRole("member")).toBe(true);
    expect(isOrgRole("superuser")).toBe(false);
  });
});

describe("permissions", () => {
  it("lets owners and admins manage members and integrations", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("member")).toBe(false);
    expect(canManageIntegrations("member")).toBe(false);
  });

  it("hides settings from members and billing from everyone but the owner", () => {
    expect(canViewSettings("admin")).toBe(true);
    expect(canViewSettings("member")).toBe(false);
    expect(canViewBilling("admin")).toBe(false);
    expect(canViewBilling("owner")).toBe(true);
  });

  it("protects the owner row", () => {
    expect(canChangeRole("owner", "owner", "admin").allowed).toBe(false);
    expect(canChangeRole("admin", "member", "owner").allowed).toBe(false);
    expect(canChangeRole("admin", "member", "admin").allowed).toBe(true);
    expect(canRemoveMember("owner", "owner").allowed).toBe(false);
    expect(canRemoveMember("admin", "member").allowed).toBe(true);
    expect(canRemoveMember("member", "member").allowed).toBe(false);
  });
});

describe("invites", () => {
  it("expires after 7 days", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiry = inviteExpiryFrom(now);
    expect(expiry.getTime() - now.getTime()).toBe(INVITE_TTL_DAYS * 86_400_000);
    expect(isInviteExpired(expiry, new Date("2026-01-07T23:59:00.000Z"))).toBe(false);
    expect(isInviteExpired(expiry, new Date("2026-01-08T00:00:01.000Z"))).toBe(true);
  });

  it("normalises and validates emails", () => {
    expect(normaliseEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });

  it("builds the accept link", () => {
    expect(inviteAcceptUrl("https://chai-retention-ai.lovable.app/", "abc")).toBe(
      "https://chai-retention-ai.lovable.app/invite/abc",
    );
  });
});
