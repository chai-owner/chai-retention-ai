import { describe, expect, it } from "vitest";
import {
  CHURN_HORIZON_DAYS,
  churnConfidenceFor,
  churnConfidenceLabel,
  churnProbabilityFromHealth,
  churnProbabilityPhrase,
} from "@/lib/churn-probability";

describe("churnProbabilityFromHealth", () => {
  it("keeps each band inside its published range", () => {
    expect(churnProbabilityFromHealth(100)).toBe(2);
    expect(churnProbabilityFromHealth(70)).toBe(15);
    expect(churnProbabilityFromHealth(69)).toBe(16);
    expect(churnProbabilityFromHealth(40)).toBe(45);
    expect(churnProbabilityFromHealth(39)).toBe(46);
    expect(churnProbabilityFromHealth(0)).toBe(85);
  });

  it("varies smoothly inside a band", () => {
    expect(churnProbabilityFromHealth(20)).toBeGreaterThan(churnProbabilityFromHealth(39));
    expect(churnProbabilityFromHealth(0)).toBeGreaterThan(churnProbabilityFromHealth(20));
    expect(churnProbabilityFromHealth(45)).toBeGreaterThan(churnProbabilityFromHealth(60));
    expect(churnProbabilityFromHealth(75)).toBeGreaterThan(churnProbabilityFromHealth(95));
  });

  it("never increases as health improves", () => {
    for (let h = 1; h <= 100; h++) {
      expect(churnProbabilityFromHealth(h)).toBeLessThanOrEqual(churnProbabilityFromHealth(h - 1));
    }
  });

  it("clamps out-of-range and invalid input", () => {
    expect(churnProbabilityFromHealth(-20)).toBe(85);
    expect(churnProbabilityFromHealth(140)).toBe(2);
    expect(churnProbabilityFromHealth(Number.NaN)).toBe(85);
  });
});

describe("confidence", () => {
  it("maps category counts to confidence levels", () => {
    expect(churnConfidenceFor(4)).toBe("high");
    expect(churnConfidenceFor(3)).toBe("high");
    expect(churnConfidenceFor(2)).toBe("moderate");
    expect(churnConfidenceFor(1)).toBe("low");
    expect(churnConfidenceFor(0)).toBe("low");
  });

  it("labels low confidence with an upgrade path", () => {
    expect(churnConfidenceLabel("high")).toBe("High confidence");
    expect(churnConfidenceLabel("moderate")).toBe("Moderate confidence");
    expect(churnConfidenceLabel("low")).toContain("upload more data");
  });
});

describe("churnProbabilityPhrase", () => {
  it("always states probability and the horizon", () => {
    expect(churnProbabilityPhrase(73)).toBe("73% probability of churning in the next 90 days");
    expect(CHURN_HORIZON_DAYS).toBe(90);
    expect(churnProbabilityPhrase(12)).not.toMatch(/chance|likelihood/i);
  });
});
