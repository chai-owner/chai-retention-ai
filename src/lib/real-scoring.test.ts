// Tier 1 — health scoring built from the user's real ingested rows.
import { describe, it, expect } from "vitest";
import { buildRealDataset, assessSufficiency } from "@/lib/real-scoring";
import { DEFAULT_METRIC_WEIGHTS, categoryFromHealth } from "@/lib/mock-data";
import { makeIngested, makeProfile, customMetric, daysAgo } from "@/test/fixtures";

const W = DEFAULT_METRIC_WEIGHTS;

describe("assessSufficiency", () => {
  it("reports nothing when no data has been added", () => {
    const s = assessSufficiency({});
    expect(s.enough).toBe(false);
    expect(s.customerCount).toBe(0);
    expect(s.reason).toMatch(/No customer records/i);
  });

  it("is not enough with customers but zero behavioural signals", () => {
    const s = assessSufficiency({
      customers: [{ customer_id: "A" }, { customer_id: "B" }, { customer_id: "C" }],
    });
    expect(s.enough).toBe(false);
    expect(s.signalDatasets).toBe(0);
    expect(s.reason).toMatch(/no transactions/i);
  });

  it("is not enough with fewer than 3 customers", () => {
    const s = assessSufficiency({
      customers: [{ customer_id: "A" }],
      transactions: [{ customer_id: "A", amount: "10" }],
    });
    expect(s.enough).toBe(false);
    expect(s.reason).toMatch(/handful/i);
  });

  it("is enough with 3+ customers and one signal dataset", () => {
    const s = assessSufficiency(makeIngested());
    expect(s.enough).toBe(true);
    expect(s.signalDatasets).toBeGreaterThanOrEqual(1);
    expect(s.reason).toBe("");
  });
});

describe("buildRealDataset — health scoring", () => {
  const profile = makeProfile();

  it("scores every ingested customer and nothing else", () => {
    const ds = buildRealDataset(makeIngested(), W, profile);
    expect(ds.customers).toHaveLength(3);
    expect(ds.customers.map((c) => c.id).sort()).toEqual(["CUS-1", "CUS-2", "CUS-3"]);
  });

  it("returns an empty dataset for empty input — never fabricates customers", () => {
    const ds = buildRealDataset({}, W, profile);
    expect(ds.customers).toHaveLength(0);
    expect(ds.totalRevenue).toBe(0);
    expect(ds.revenueAtRisk).toBe(0);
  });

  it("ranks the engaged customer healthier than the disengaged one", () => {
    const ds = buildRealDataset(makeIngested(), W, profile);
    const byId = Object.fromEntries(ds.customers.map((c) => [c.id, c]));
    expect(byId["CUS-1"].health).toBeGreaterThan(byId["CUS-3"].health);
    expect(byId["CUS-3"].churnProbability).toBeGreaterThan(byId["CUS-1"].churnProbability);
  });

  it("keeps health, risk and churn probability inside valid ranges", () => {
    const ds = buildRealDataset(makeIngested(), W, profile);
    for (const c of ds.customers) {
      expect(c.health).toBeGreaterThanOrEqual(0);
      expect(c.health).toBeLessThanOrEqual(100);
      expect(c.risk).toBe(Math.round(100 - c.health));
      expect(c.churnProbability).toBeGreaterThanOrEqual(3);
      expect(c.churnProbability).toBeLessThanOrEqual(96);
      expect(categoryFromHealth(c.health)).toBeTruthy();
    }
  });

  it("is deterministic for identical input", () => {
    const a = buildRealDataset(makeIngested(), W, profile);
    const b = buildRealDataset(makeIngested(), W, profile);
    expect(a.customers.map((c) => c.health)).toEqual(b.customers.map((c) => c.health));
  });

  it("gives a neutral 60 when a customer has no behavioural signal at all", () => {
    const ds = buildRealDataset(
      { customers: [{ customer_id: "SOLO", name: "Solo" }] },
      W,
      profile,
    );
    expect(ds.customers[0].health).toBe(60);
  });

  it("derives revenue from monthly_revenue when present, else from transactions", () => {
    const ds = buildRealDataset(
      {
        customers: [
          { customer_id: "A", monthly_revenue: "100" },
          { customer_id: "B" },
        ],
        transactions: [
          { customer_id: "B", transaction_id: "T", amount: "250", transaction_date: daysAgo(3) },
        ],
      },
      W,
      profile,
    );
    const byId = Object.fromEntries(ds.customers.map((c) => [c.id, c]));
    expect(byId["A"].revenue).toBe(1200);
    expect(byId["B"].revenue).toBe(250);
  });
});

describe("buildRealDataset — metric weights", () => {
  const profile = makeProfile();

  it("a weight of 0 removes the metric from the blend", () => {
    const data = makeIngested();
    const withLogins = buildRealDataset(data, { ...W, "Login frequency": 5 }, profile);
    const withoutLogins = buildRealDataset(data, { ...W, "Login frequency": 0 }, profile);
    const worstWith = withLogins.customers.find((c) => c.id === "CUS-3")!.health;
    const worstWithout = withoutLogins.customers.find((c) => c.id === "CUS-3")!.health;
    expect(worstWith).not.toBe(worstWithout);
  });

  it("weighting a metric heavier moves the score toward that metric", () => {
    const data = makeIngested();
    const flat = buildRealDataset(data, { ...W }, profile);
    const heavy = buildRealDataset(
      data,
      Object.fromEntries(Object.keys(W).map((k) => [k, k === "Login frequency" ? 5 : 1])),
      profile,
    );
    const c1flat = flat.customers.find((c) => c.id === "CUS-1")!;
    const c1heavy = heavy.customers.find((c) => c.id === "CUS-1")!;
    // CUS-1 has the top login score (100), so weighting logins lifts it.
    expect(c1heavy.health).toBeGreaterThanOrEqual(c1flat.health);
  });

  it("an unknown metric name in the weight map does not break scoring", () => {
    const ds = buildRealDataset(makeIngested(), { ...W, "Made Up Metric": 5 }, makeProfile());
    expect(ds.customers.every((c) => Number.isFinite(c.health))).toBe(true);
  });
});

describe("buildRealDataset — AI-generated custom metrics", () => {
  it("blends an AI metric's uploaded values into the health score", () => {
    const profile = makeProfile({ metrics: [customMetric] });
    const key = "metric_class_attendance_rate";
    const col = "class_attendance_rate";
    const base = makeIngested();

    const high = buildRealDataset(
      { ...base, [key]: [{ customer_id: "CUS-2", date: daysAgo(1), [col]: "100" }] },
      { ...W, [customMetric.name]: 5 },
      profile,
    );
    const low = buildRealDataset(
      { ...base, [key]: [{ customer_id: "CUS-2", date: daysAgo(1), [col]: "0" }] },
      { ...W, [customMetric.name]: 5 },
      profile,
    );
    const h = high.customers.find((c) => c.id === "CUS-2")!.health;
    const l = low.customers.find((c) => c.id === "CUS-2")!.health;
    expect(h).toBeGreaterThan(l);
    expect(high.customers.find((c) => c.id === "CUS-2")!.subScores?.[customMetric.name]).toBe(100);
  });

  it("uses the most recent value per customer, not the oldest", () => {
    const profile = makeProfile({ metrics: [customMetric] });
    const key = "metric_class_attendance_rate";
    const col = "class_attendance_rate";
    const ds = buildRealDataset(
      {
        customers: [{ customer_id: "CUS-2" }],
        [key]: [
          { customer_id: "CUS-2", date: daysAgo(90), [col]: "10" },
          { customer_id: "CUS-2", date: daysAgo(1), [col]: "90" },
        ],
      },
      { ...W, [customMetric.name]: 5 },
      profile,
    );
    expect(ds.customers[0].subScores?.[customMetric.name]).toBe(90);
  });

  it("ignores an AI metric a customer has no value for", () => {
    const profile = makeProfile({ metrics: [customMetric] });
    const ds = buildRealDataset(makeIngested(), W, profile);
    for (const c of ds.customers) {
      expect(c.subScores?.[customMetric.name]).toBeUndefined();
    }
  });
});

describe("revenue at risk vs retention opportunity", () => {
  it("retention opportunity is positive and never exceeds revenue at risk", () => {
    const ds = buildRealDataset(makeIngested(), W, makeProfile());
    expect(ds.revenueAtRisk).toBeGreaterThan(0);
    expect(ds.retentionOpportunity).toBeGreaterThan(0);
    expect(ds.retentionOpportunity).toBeLessThanOrEqual(ds.revenueAtRisk);
  });

  it("recovers at least ~32% of at-risk revenue (post-adjustment floor)", () => {
    const ds = buildRealDataset(makeIngested(), W, makeProfile());
    expect(ds.retentionOpportunity / ds.revenueAtRisk).toBeGreaterThanOrEqual(0.32);
  });

  it("both are zero when nobody is at risk", () => {
    const ds = buildRealDataset({ customers: [{ customer_id: "A" }] }, W, makeProfile());
    expect(ds.revenueAtRisk).toBe(0);
    expect(ds.retentionOpportunity).toBe(0);
  });
});
