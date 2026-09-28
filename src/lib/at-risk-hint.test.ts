import { describe, expect, it } from "vitest";
import { atRiskHint } from "@/lib/at-risk-hint";

describe("at-risk card hint", () => {
  it("mentions unscoreable customers when there are any", () => {
    expect(atRiskHint(0, 102)).toBe("0 critical · 102 not enough data to judge");
    expect(atRiskHint(3, 7)).toBe("3 critical · 7 not enough data to judge");
  });

  it("keeps today's text when every customer is scoreable", () => {
    expect(atRiskHint(0, 0)).toBe("0 critical");
    expect(atRiskHint(5, 0)).toBe("5 critical");
  });
});
