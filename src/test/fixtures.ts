// Shared, deterministic fixtures for the test suite.
import type { IngestedData } from "@/lib/ingested-data-store";
import type { OnboardingProfile } from "@/lib/profile-store";
import type { PlannerMetric } from "@/lib/mock-data";

/** Days ago as a YYYY-MM-DD string, relative to now. */
export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export const customMetric: PlannerMetric = {
  name: "Class attendance rate",
  why: "Members who stop attending cancel.",
  churn: "Attendance decline precedes cancellation.",
  cadence: "Weekly",
  benchmark: "≥ 3 / week",
  benchmarkScore: 70,
  category: "Engagement",
  unit: "%",
  decimals: 0,
  valueAt0: 0,
  valueAt100: 100,
};

export function makeProfile(overrides: Partial<OnboardingProfile> = {}): OnboardingProfile {
  return {
    company: "Test Co",
    industry: "Fitness",
    model: "SaaS",
    size: "11-50",
    customers: "100-500",
    avgValue: "$500",
    whatBuy: "Subscriptions",
    cadence: "Monthly",
    lifespan: "2 years",
    concerns: "Churn after 3 months",
    segments: [{ name: "Enterprise", min: "1000", max: "100000" }],
    successActions: "Customers renew and log in weekly",
    disengagement: "They stop logging in",
    tracked: {},
    channels: [],
    metricWeights: {},
    metrics: [],
    fullName: "Test User",
    email: "test@example.com",
    unlocked: true,
    ...overrides,
  };
}

/** A small but complete real dataset: 3 customers with mixed health signals. */
export function makeIngested(): IngestedData {
  return {
    customers: [
      { customer_id: "CUS-1", name: "Healthy Inc", email: "a@h.com", signup_date: "2024-01-05", monthly_revenue: "1000" },
      { customer_id: "CUS-2", name: "Wobbly Ltd", email: "b@w.com", signup_date: "2024-03-11", monthly_revenue: "500" },
      { customer_id: "CUS-3", name: "Sinking Co", email: "c@s.com", signup_date: "2023-08-20", monthly_revenue: "2000" },
    ],
    transactions: [
      { customer_id: "CUS-1", transaction_id: "T1", amount: "1000", transaction_date: daysAgo(5) },
      { customer_id: "CUS-2", transaction_id: "T2", amount: "500", transaction_date: daysAgo(60) },
      { customer_id: "CUS-3", transaction_id: "T3", amount: "300", transaction_date: daysAgo(170) },
    ],
    usage: [
      { customer_id: "CUS-1", date: daysAgo(2), logins: "20", features_used: "8" },
      { customer_id: "CUS-2", date: daysAgo(2), logins: "6", features_used: "3" },
      { customer_id: "CUS-3", date: daysAgo(2), logins: "1", features_used: "1" },
    ],
    support: [
      { customer_id: "CUS-1", ticket_id: "K1", created_date: daysAgo(20), status: "resolved", satisfaction_score: "5" },
      { customer_id: "CUS-3", ticket_id: "K2", created_date: daysAgo(4), status: "open", satisfaction_score: "2" },
      { customer_id: "CUS-3", ticket_id: "K3", created_date: daysAgo(2), status: "reopened", satisfaction_score: "1" },
    ],
    surveys: [
      { customer_id: "CUS-1", survey_date: daysAgo(10), score: "5", type: "CSAT" },
      { customer_id: "CUS-3", survey_date: daysAgo(9), score: "1", type: "CSAT" },
    ],
  };
}
