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
      targetName: "Customer",
      targetEmail: "customer@example.com",
      auditId: "00000000-0000-4000-8000-000000000000",
      expiresAt: "2026-08-31T12:30:00.000Z",
    });
    expect(impersonationStore.getSnapshot()?.adminSession.access_token).toBe("admin-access");
    expect(window.localStorage.getItem("chai.impersonation")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain("admin-access");
  });
});