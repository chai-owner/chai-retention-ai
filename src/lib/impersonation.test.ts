import { beforeEach, describe, expect, it, vi } from "vitest";

describe("impersonation lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("uses a 30-minute duration", async () => {
    const { IMPERSONATION_DURATION_MS } = await import("./impersonation");
    expect(IMPERSONATION_DURATION_MS).toBe(30 * 60 * 1000);
  });

  it("derives manual and timeout audit reasons at the exact server deadline", async () => {
    const { impersonationEndReason } = await import("./impersonation-policy");
    const startedAt = "2026-08-31T12:00:00.000Z";
    expect(impersonationEndReason(startedAt, Date.parse("2026-08-31T12:29:59.999Z"))).toBe("manual");
    expect(impersonationEndReason(startedAt, Date.parse("2026-08-31T12:30:00.000Z"))).toBe("timeout");
  });

  it("calculates active and expired deadlines", async () => {
    const { millisecondsUntilExpiry } = await import("./impersonation");
    expect(millisecondsUntilExpiry("2026-08-31T12:30:00.000Z", Date.parse("2026-08-31T12:00:00.000Z"))).toBe(1_800_000);
    expect(millisecondsUntilExpiry("2026-08-31T12:30:00.000Z", Date.parse("2026-08-31T12:30:00.000Z"))).toBe(0);
    expect(millisecondsUntilExpiry("invalid", Date.now())).toBe(0);
  });

  it("keeps session data in memory and removes legacy persisted data", async () => {
    window.localStorage.setItem("chai.impersonation", "legacy-secret");
    const { impersonationStore } = await import("./impersonation");
    const session = { access_token: "admin-access", refresh_token: "admin-refresh" };
    impersonationStore.start({
      adminSession: session as never,
      targetUserId: "00000000-0000-4000-8000-000000000001",
      targetName: "Customer",
      targetEmail: "customer@example.com",
      auditId: "00000000-0000-4000-8000-000000000000",
      expiresAt: "2026-08-31T12:30:00.000Z",
    });
    expect(impersonationStore.getSnapshot()?.adminSession.access_token).toBe("admin-access");
    expect(window.localStorage.getItem("chai.impersonation")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain("admin-access");
  });

  it("removes a persisted target auth session", async () => {
    window.localStorage.setItem("sb-example-auth-token", "target-session");
    window.localStorage.setItem("unrelated", "keep-me");
    const { clearPersistedImpersonatedAuth } = await import("./impersonation");
    clearPersistedImpersonatedAuth();
    expect(window.localStorage.getItem("sb-example-auth-token")).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep-me");
  });
});