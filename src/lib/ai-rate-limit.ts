// Per-user hourly AI call limits, configurable per subscription plan.
// Pure logic so it can be unit-tested without a database.

export const DEFAULT_AI_HOURLY_LIMIT = 60;

// Plan id (as stored on the subscription record) -> calls allowed per hour.
// Unknown or missing plans fall back to DEFAULT_AI_HOURLY_LIMIT.
export const AI_HOURLY_LIMITS: Record<string, number> = {
  free: 20,
  starter: 60,
  core: 60,
  growth: 200,
  standard: 200,
  pro: 200,
  scale: 500,
  enterprise: 2000,
};

export function aiHourlyLimitForPlan(planId?: string | null): number {
  const key = (planId ?? "").trim().toLowerCase();
  if (!key) return DEFAULT_AI_HOURLY_LIMIT;
  for (const [plan, limit] of Object.entries(AI_HOURLY_LIMITS)) {
    if (key === plan || key.includes(plan)) return limit;
  }
  return DEFAULT_AI_HOURLY_LIMIT;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  used: number;
  retryAfterMinutes: number;
}

export function evaluateRateLimit(used: number, limit: number): RateLimitDecision {
  return {
    allowed: used < limit,
    limit,
    used,
    retryAfterMinutes: used < limit ? 0 : 60,
  };
}

export function rateLimitMessage(decision: RateLimitDecision): string {
  return `You've reached your hourly AI limit (${decision.limit} requests). Please try again in about an hour, or upgrade your plan for a higher limit.`;
}
