import { describe, expect, it } from "vitest";
import { REAL_DATA_READY_THRESHOLD, summariseReadiness } from "./readiness";

describe("summariseReadiness", () => {
  it("is not ready with no connected support data", () => {
    const s = summariseReadiness([]);
    expect(s.ready).toBe(false);
    expect(s.largestAccount).toBeNull();
    expect(s.totalConnectedConversations).toBe(0);
    expect(s.message).toContain("constructed test examples");
  });

  it("is not ready below the threshold and names the largest account", () => {
    const s = summariseReadiness([
      { userId: "a", label: "Acme", connectedConversations: 19 },
      { userId: "b", label: "Bolt", connectedConversations: 3 },
    ]);
    expect(s.ready).toBe(false);
    expect(s.largestAccount?.label).toBe("Acme");
    expect(s.totalConnectedConversations).toBe(22);
    expect(s.message).toContain("19 real support conversations");
  });

  it("flags ready at the threshold", () => {
    const s = summariseReadiness([
      { userId: "a", label: "Acme", connectedConversations: REAL_DATA_READY_THRESHOLD },
      { userId: "b", label: "Bolt", connectedConversations: 1 },
    ]);
    expect(s.ready).toBe(true);
    expect(s.readyAccounts.map((a) => a.label)).toEqual(["Acme"]);
    expect(s.message).toContain("Ready to re-run Phase 0 against real data");
    expect(s.message).toContain("constructed test examples");
  });
});
