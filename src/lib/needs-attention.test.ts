import { describe, expect, it } from "vitest";
import { selectNeedsAttention, needsAttentionEmpty } from "./needs-attention";
import { sanitizeAiTip, buildRiskTipPrompt, AI_FEATURE_RULES } from "./ai-rules";
import { ASK_CHAI_STYLE_RULES } from "./ai.functions";

const c = (id: string, health: number, risk: number, notEnoughData?: boolean) => ({ id, health, risk, notEnoughData });

describe("selectNeedsAttention", () => {
  it("only at-risk and critical customers, riskiest first", () => {
    const list = [
      c("healthy", 90, 10),
      c("watch", 60, 40),
      c("ned", 20, 99, true),
      c("atrisk", 45, 55),
      c("critical", 20, 80),
    ];
    expect(selectNeedsAttention(list).map((x) => x.id)).toEqual(["critical", "atrisk"]);
  });
  it("five healthy customers give an empty list", () => {
    expect(selectNeedsAttention([1, 2, 3, 4, 5].map((i) => c(`h${i}`, 95 - i, 5 + i)))).toEqual([]);
  });
  it("respects the limit", () => {
    expect(selectNeedsAttention([1, 2, 3, 4, 5, 6, 7].map((i) => c(`r${i}`, 20, i)))).toHaveLength(5);
  });
});

describe("needsAttentionEmpty", () => {
  it("mentions customers without enough data, with Data Quality link", () => {
    expect(needsAttentionEmpty(13)).toEqual({
      text: "No customers need attention right now. 13 customers don't have enough data yet.",
      linkToDataQuality: true,
    });
  });
  it("plain message otherwise", () => {
    expect(needsAttentionEmpty(0)).toEqual({ text: "No customers need attention right now.", linkToDataQuality: false });
  });
});

describe("tip rules", () => {
  it("rejects ChAi automation and revenue labels", () => {
    expect(sanitizeAiTip("Send an automated check-in email today.", "USD")).toBeNull();
    expect(sanitizeAiTip("This high-revenue account is slipping — call them.", "USD")).toBeNull();
    expect(sanitizeAiTip("Set up an alert for this customer.", "USD")).toBeNull();
  });
  it("rejects currency symbols other than the account's", () => {
    expect(sanitizeAiTip("Payments are late on $1,200 — call them.", "ZAR")).toBeNull();
    expect(sanitizeAiTip("Payments are late on R 1,200 — call them.", "USD")).toBeNull();
    expect(sanitizeAiTip("Payments are late on R 1,200 — call them this week.", "ZAR")).toBe(
      "Payments are late on R 1,200 — call them this week.",
    );
  });
  it("keeps a user-action tip", () => {
    expect(sanitizeAiTip("Invoices are overdue — call Northstar Legal this week.", "USD")).toBeTruthy();
  });
  it("prompt reuses the shared rules and the account currency", () => {
    const p = buildRiskTipPrompt(
      [{ id: "a", name: "Acme", churnProbability: 60, revenue: 190000, health: 30, factors: ["Payments overdue"] }],
      "ZAR",
    );
    expect(p).toContain(AI_FEATURE_RULES);
    expect(p).toContain("R 190,000");
    expect(p).not.toMatch(/\$/);
    expect(p).toContain("Payments overdue");
    expect(ASK_CHAI_STYLE_RULES).toContain(AI_FEATURE_RULES);
  });
});
