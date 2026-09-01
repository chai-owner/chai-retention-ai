import { describe, it, expect } from "vitest";
import {
  churnMetaOf,
  scoreCustomers,
  riskLevelFor,
  metricDirection,
  horizonDays,
  type HistoryPoint,
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

  it("scores against the customer's own 30-day baseline when history exists", () => {
    const history: HistoryPoint[] = [
      { customer_id: "a", metric: metric.name, value: 5, scored_at: NOW - 2 * DAY },
      { customer_id: "a", metric: metric.name, value: 5, scored_at: NOW - 10 * DAY },
    ];
    const scores = byId(scoreCustomers([metric], data, { now: NOW, history }));
    // a resolves to 10 against a baseline of 5 — improving, so well above 50.
    expect(scores.a!.score).toBe(100);
    expect(entries(scores.a!)[0]).toMatchObject({ basis: "baseline-30d", baseline: 5 });
    // c has no history and still uses the cohort fallback.
    expect(entries(scores.c!)[0]!.basis).toBe("cohort");
  });

  it("sits at 50 when the value matches the baseline", () => {
    const history: HistoryPoint[] = [
      { customer_id: "b", metric: metric.name, value: 50, scored_at: NOW - DAY },
    ];
    const scores = byId(scoreCustomers([metric], data, { now: NOW, history }));
    expect(scores.b!.score).toBe(50);
  });

  it("uses the 90-day baseline when there is nothing in the last 30 days", () => {
    const history: HistoryPoint[] = [
      { customer_id: "b", metric: metric.name, value: 100, scored_at: NOW - 60 * DAY },
    ];
    const scores = byId(scoreCustomers([metric], data, { now: NOW, history }));
    expect(entries(scores.b!)[0]).toMatchObject({ basis: "baseline-90d", baseline: 100 });
    // 50 against a baseline of 100 is a decline for a higher-is-better metric.
    expect(scores.b!.score).toBe(25);
  });

  it("rewards lower-is-better metrics that improve toward zero", () => {
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
    const history: HistoryPoint[] = [
      { customer_id: "a", metric: lower.name, value: 40, scored_at: NOW - 3 * DAY },
    ];
    const scores = byId(scoreCustomers([lower], payData, { now: NOW, history }));
    // 10 days since payment against a 40-day baseline is a big improvement.
    expect(scores.a!.score).toBeGreaterThan(50);
    expect(entries(scores.a!)[0]!.basis).toBe("baseline-30d");
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

  it("scores 0 when no metric resolves for a customer", () => {
    const scores = scoreCustomers([metric], { customers: [{ customer_id: "z" }] });
    expect(scores[0]).toMatchObject({ customer_id: "z", score: 0, risk_level: "critical" });
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
