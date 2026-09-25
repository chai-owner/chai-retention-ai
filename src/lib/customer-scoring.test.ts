import { describe, it, expect } from "vitest";
import {
  churnMetaOf,
  scoreCustomers,
  riskLevelFor,
  metricDirection,
  horizonDays,
  type ScoreBreakdownEntry,
} from "@/lib/customer-scoring";
import type { PlannerMetric } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";

/** Metric contributions only, with the churn meta entry filtered out. */
const entries = (score: { score_breakdown: unknown[] }): ScoreBreakdownEntry[] =>
  score.score_breakdown.filter((e) => !churnMetaOf([e])) as ScoreBreakdownEntry[];

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-31T00:00:00Z");

const metric: PlannerMetric = {
  name: "Average Workout Duration",
  why: "Average duration of each workout session in minutes.",
  churn: "Shorter sessions signal disengagement.",
  category: "Engagement",
  weight: 2,
};

const data: IngestedData = {
  customers: [{ customer_id: "a" }, { customer_id: "b" }, { customer_id: "c" }],
  usage: [
    { customer_id: "a", workout_duration_minutes: "10", occurred_at: "2026-01-01" },
    { customer_id: "b", workout_duration_minutes: "50", occurred_at: "2026-01-01" },
    { customer_id: "c", workout_duration_minutes: "90", occurred_at: "2026-01-01" },
  ],
};

const byId = (scores: ReturnType<typeof scoreCustomers>) =>
  Object.fromEntries(scores.map((s) => [s.customer_id, s]));

describe("riskLevelFor", () => {
  it("bands scores", () => {
    expect(riskLevelFor(70)).toBe("healthy");
    expect(riskLevelFor(40)).toBe("at-risk");
    expect(riskLevelFor(39.9)).toBe("critical");
  });
});

describe("metricDirection", () => {
  it("treats elapsed-time and transaction recency as lower-is-better", () => {
    expect(
      metricDirection({
        name: "Days Since Last Premium Payment",
        why: "Payment timeliness",
        churn: "Overdue payments precede lapse",
        category: "Transactions",
      }),
    ).toBe("lower");
    expect(
      metricDirection({
        name: "Support Ticket Volume",
        why: "Friction",
        churn: "Spikes predict churn",
        category: "Support",
      }),
    ).toBe("lower");
  });

  it("treats engagement and retention as higher-is-better", () => {
    expect(metricDirection(metric)).toBe("higher");
    expect(
      metricDirection({
        name: "Policy Renewal Rate",
        why: "Renewals",
        churn: "Low renewals mean shopping around",
        category: "Retention",
      }),
    ).toBe("higher");
  });

  it("respects explicit display anchors over inference", () => {
    expect(metricDirection({ ...metric, valueAt0: 90, valueAt100: 10 })).toBe("lower");
  });
});

describe("horizonDays", () => {
  it("derives the horizon from stated purchase cadence", () => {
    expect(horizonDays("Customers buy every 30 days")).toBe(90);
    expect(horizonDays("Weekly")).toBe(21);
  });

  it("falls back to lifespan, then to 180 days", () => {
    expect(horizonDays("", "2 years")).toBe(73);
    expect(horizonDays()).toBe(180);
  });
});

describe("scoreCustomers", () => {
  it("falls back to cohort min-max with no history", () => {
    const scores = byId(scoreCustomers([metric], data, { now: NOW }));
    expect(scores.a!.score).toBe(0);
    expect(scores.c!.score).toBe(100);
    expect(entries(scores.a!)[0]!.basis).toBe("cohort");
  });

  it("compares recent 30 days to the customer's own prior 90 days", () => {
    const d = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
    const trendData: IngestedData = {
      customers: [{ customer_id: "a" }, { customer_id: "b" }],
      usage: [
        // a: 60-minute sessions for months, now 30 → halved.
        ...[40, 60, 80, 100, 110, 115].map((n) => ({ customer_id: "a", workout_duration_minutes: "60", occurred_at: d(n) })),
        { customer_id: "a", workout_duration_minutes: "30", occurred_at: d(5) },
        // b: short history (one record) → no personal baseline.
        { customer_id: "b", workout_duration_minutes: "20", occurred_at: d(5) },
      ],
    };
    const scores = byId(scoreCustomers([metric], trendData, { now: NOW }));
    const a = entries(scores.a!)[0]!;
    expect(a.basis).toBe("personal");
    expect(a.baseline).toBe(60);
    expect(a.normalised).toBe(25);
    expect(a.comparison).toContain("down 50%");
    expect(a.comparison).toContain("own previous 90 days");
    expect(entries(scores.b!)[0]!.basis).toBe("cohort");
    expect(entries(scores.b!)[0]!.comparison).toBeUndefined();
  });

  it("blends thin personal history with the fallback", () => {
    const d = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
    const thin: IngestedData = {
      customers: [{ customer_id: "a" }, { customer_id: "b" }],
      usage: [
        ...[40, 60, 80].map((n) => ({ customer_id: "a", workout_duration_minutes: "60", occurred_at: d(n) })),
        { customer_id: "a", workout_duration_minutes: "60", occurred_at: d(5) },
        { customer_id: "b", workout_duration_minutes: "90", occurred_at: d(5) },
      ],
    };
    const a = entries(byId(scoreCustomers([metric], thin, { now: NOW })).a!)[0]!;
    expect(a.basis).toBe("blended");
    expect(a.comparison).toContain("limited history");
  });

  it("judges days-since-last against the customer's own rhythm", () => {
    const lower: PlannerMetric = {
      name: "Days Since Last Payment",
      why: "Payment recency",
      churn: "Overdue payments precede lapse",
      category: "Transactions",
      weight: 1,
    };
    const d = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
    // Pays every ~10 days; last payment 30 days ago → 3x usual gap.
    const payData: IngestedData = {
      customers: [{ customer_id: "a" }],
      transactions: [30, 40, 50, 60, 70, 80, 90].map((n, i) => ({ customer_id: "a", transaction_id: `t${i}`, amount: "10", payment_date: d(n) })),
    };
    const e = entries(byId(scoreCustomers([lower], payData, { now: NOW })).a!)[0]!;
    expect(e.basis).toBe("personal");
    expect(e.baseline).toBe(10);
    expect(e.normalised).toBe(0);
    expect(e.comparison).toContain("usually goes about 10 days");
  });

  it("uses the cadence horizon for elapsed metrics without history", () => {
    const lower: PlannerMetric = {
      name: "Days Since Last Payment",
      why: "Payment recency",
      churn: "Overdue payments precede lapse",
      category: "Transactions",
      weight: 1,
    };
    const payData: IngestedData = {
      customers: [{ customer_id: "a" }],
      transactions: [{ customer_id: "a", amount: "10", payment_date: "2026-08-21" }],
    };
    const scores = byId(scoreCustomers([lower], payData, { now: NOW, cadence: "every 30 days" }));
    const entry = entries(scores.a!)[0]!;
    expect(entry.basis).toBe("horizon");
    // 10 days elapsed against a 90-day horizon.
    expect(scores.a!.score).toBeCloseTo(88.89, 1);
  });

  it("returns nothing without customers or metrics", () => {
    expect(scoreCustomers([], data)).toEqual([]);
    expect(scoreCustomers([metric], { customers: [] })).toEqual([]);
  });

  it("omits customers when no metric resolves", () => {
    const scores = scoreCustomers([metric], { customers: [{ customer_id: "z" }] });
    expect(scores).toEqual([]);
  });
});

describe("churn probability meta", () => {
  it("stores churn probability and confidence in score_breakdown", () => {
    const scores = byId(scoreCustomers([metric], data, { now: NOW }));
    const meta = churnMetaOf(scores.a!.score_breakdown)!;
    expect(meta).toBeTruthy();
    expect(meta.churn_horizon_days).toBe(90);
    expect(meta.churn_probability).toBe(scores.a!.churn_probability);
    // Score 0 → deep in the critical band.
    expect(scores.a!.churn_probability).toBe(85);
    // Only one metric category present.
    expect(meta.data_categories).toBe(1);
    expect(scores.a!.churn_confidence).toBe("low");
    expect(scores.c!.churn_probability).toBe(2);
  });
});

describe("payment health metric", () => {
  const overdueData = {
    ...data,
    transactions: [
      {
        customer_id: "a",
        transaction_id: "INV-9",
        amount_due: "500",
        due_date: new Date(NOW - 45 * DAY).toISOString().slice(0, 10),
        transaction_date: new Date(NOW - 50 * DAY).toISOString().slice(0, 10),
      },
    ],
  } as typeof data;

  it("adds a weighted Payment Health contribution when invoices are overdue", () => {
    const scores = byId(scoreCustomers([metric], overdueData, { now: NOW }));
    const payment = entries(scores.a!).find((e) => e.metric === "Payment Health")!;
    expect(payment).toBeTruthy();
    expect(payment.weight).toBe(5);
    expect(payment.basis).toBe("payment");
    expect(payment.value).toBe(45);
    expect(payment.normalised).toBeGreaterThan(15);
    expect(payment.normalised).toBeLessThan(40);
  });

  it("scores customers with no overdue invoices at full payment health", () => {
    const scores = byId(scoreCustomers([metric], overdueData, { now: NOW }));
    const payment = entries(scores.b!).find((e) => e.metric === "Payment Health")!;
    expect(payment.normalised).toBe(100);
  });

  it("is omitted entirely when no payment data is present", () => {
    const scores = byId(scoreCustomers([metric], data, { now: NOW }));
    expect(entries(scores.a!).some((e) => e.metric === "Payment Health")).toBe(false);
  });
});
