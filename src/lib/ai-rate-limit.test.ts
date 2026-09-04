import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_HOURLY_LIMIT,
  aiHourlyLimitForPlan,
  evaluateRateLimit,
  isRateLimitExempt,
  rateLimitMessage,
} from "./ai-rate-limit";

describe("ai hourly rate limits", () => {
  it("falls back to the default limit for unknown or missing plans", () => {
    expect(aiHourlyLimitForPlan(null)).toBe(DEFAULT_AI_HOURLY_LIMIT);
    expect(aiHourlyLimitForPlan("")).toBe(DEFAULT_AI_HOURLY_LIMIT);
    expect(aiHourlyLimitForPlan("mystery-tier")).toBe(DEFAULT_AI_HOURLY_LIMIT);
  });

  it("resolves configured plans, including prefixed plan ids", () => {
    expect(aiHourlyLimitForPlan("free")).toBe(20);
    expect(aiHourlyLimitForPlan("PRO")).toBe(200);
    expect(aiHourlyLimitForPlan("chai-enterprise-annual")).toBe(2000);
  });

  it("allows calls below the limit and blocks at or above it", () => {
    expect(evaluateRateLimit(5, 20).allowed).toBe(true);
    expect(evaluateRateLimit(20, 20).allowed).toBe(false);
    expect(evaluateRateLimit(41, 20).retryAfterMinutes).toBe(60);
  });

  it("produces a user-friendly limit message", () => {
    const msg = rateLimitMessage(evaluateRateLimit(20, 20));
    expect(msg).toContain("20");
    expect(msg.toLowerCase()).toContain("hourly");
  });
});

describe("rate limit exemptions", () => {
  it("exempts the onboarding metric operations", () => {
    expect(isRateLimitExempt("recommendMetrics")).toBe(true);
    expect(isRateLimitExempt("checkAiConfig")).toBe(true);
    expect(isRateLimitExempt("recommendMetricWeights")).toBe(true);
  });

  it("does not exempt other operations", () => {
    expect(isRateLimitExempt("askChai")).toBe(false);
    expect(isRateLimitExempt("summarizeRiskReasons")).toBe(false);
  });
});
