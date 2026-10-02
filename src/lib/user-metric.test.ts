import { describe, expect, it } from "vitest";
import { metricDirection, inferredMetricDirection } from "@/lib/metric-direction";
import { scoreCustomers } from "@/lib/customer-scoring";
import { buildRealDataset } from "@/lib/real-scoring";
import { assessCoverage, metricsWithoutData } from "@/lib/data-coverage";
import {
  buildUserMetric,
  parseMetricEnrichment,
  USER_METRIC_FALLBACK_REASON,
} from "@/lib/user-metric";
import { withMetricDirection } from "@/lib/use-set-metric-direction";
import { daysAgo, makeProfile } from "@/test/fixtures";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";

describe("direction priority", () => {
  const base: PlannerMetric = { name: "Unresolved Support Tickets", why: "", churn: "", category: "Support" };

  it("reference values beat an explicit direction", () => {
    expect(metricDirection({ ...base, direction: "lower", valueAt0: 0, valueAt100: 10 })).toBe("higher");
    expect(metricDirection({ ...base, direction: "higher", valueAt0: 10, valueAt100: 0 })).toBe("lower");
  });

  it("an explicit direction beats wording inference", () => {
    expect(inferredMetricDirection(base)).toBe("lower");
    expect(metricDirection({ ...base, direction: "higher" })).toBe("higher");
  });

  it("without either, inference is unchanged", () => {
    expect(metricDirection(base)).toBe(inferredMetricDirection(base));
    const login: PlannerMetric = { name: "Weekly logins", why: "", churn: "", category: "Engagement" };
    expect(metricDirection(login)).toBe("higher");
  });

  it("clearing a direction goes back to inference", () => {
    const set = withMetricDirection([base], base.name, "higher");
    expect(set[0]!.direction).toBe("higher");
    const cleared = withMetricDirection(set, base.name, null);
    expect("direction" in cleared[0]!).toBe(false);
  });
});

// "Open tickets" reads as lower-is-better; an explicit "higher" must flip both screens.
describe("both scoring paths honour an explicit direction", () => {
  const metric: PlannerMetric = {
    name: "Unresolved Support Tickets",
    why: "Open tickets waiting on us",
    churn: "Friction builds frustration",
    category: "Support",
    direction: "higher",
  };
  const ids = ["A", "B", "C", "D", "E"];
  const open: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  const data = {
    customers: ids.map((c) => ({ customer_id: c, name: c })),
    support: ids.flatMap((c) => [
      ...[1, 2, 3].map((n) => ({ ticket_id: `${c}-r${n}`, customer_id: c, status: "solved", created_date: daysAgo(n) })),
      ...Array.from({ length: open[c]! }, (_, i) => ({ ticket_id: `${c}-${i}`, customer_id: c, status: "open", created_date: daysAgo(1) })),
    ]),
  } as unknown as IngestedData;

  it("nightly score: more open tickets now scores higher", () => {
    const rows = scoreCustomers([metric], data);
    const part = (id: string) =>
      (rows.find((r) => r.customer_id === id)!.score_breakdown as Array<{ metric?: string; normalised?: number }>).find((e) => e.metric === metric.name)!.normalised!;
    expect(part("E")).toBeGreaterThan(part("A"));
  });

  it("customer page: more open tickets now scores higher", () => {
    const ds = buildRealDataset(data, { [metric.name]: 3 }, makeProfile({ metrics: [metric] }));
    const sub = (id: string) => ds.customers.find((c) => c.id === id)!.subScores![metric.name]!;
    expect(sub("E")).toBeGreaterThan(sub("A"));
  });
});

describe("adding a user metric", () => {
  it("requires a direction", () => {
    expect(buildUserMetric("Missed appointments", null, null)).toBeNull();
    expect(buildUserMetric("  ", "lower", null)).toBeNull();
  });

  it("falls back to today's filler when the AI call fails, keeping the user's choice", () => {
    const m = buildUserMetric("Missed appointments", "lower", null)!;
    expect(m).toMatchObject({
      name: "Missed appointments",
      category: "Engagement",
      why: "",
      churn: "",
      weight: 3,
      reason: USER_METRIC_FALLBACK_REASON,
      direction: "lower",
      userAdded: true,
    });
  });

  it("uses the enrichment but never renames the metric, and the user's choice wins", () => {
    const e = parseMetricEnrichment(
      '```json\n{"category":"retention","why":"Shows patients skipping booked visits.","churn":"Skipped visits precede leaving.","reason":"Core to a practice.","direction":"lower","name":"Renamed"}\n```',
    )!;
    expect(e.category).toBe("Retention");
    expect(e.direction).toBe("lower");
    const m = buildUserMetric("missed appts", "higher", e)!;
    expect(m.name).toBe("missed appts");
    expect(m.direction).toBe("higher");
    expect(m.why).toBe("Shows patients skipping booked visits.");
  });

  it("rejects unreadable or off-list enrichment", () => {
    expect(parseMetricEnrichment("sorry, I can't")).toBeNull();
    expect(parseMetricEnrichment('{"category":"Vibes","why":"x"}')).toBeNull();
  });
});

describe("no data yet list", () => {
  it("lists only metrics with no matching rows, with a hint from the description", () => {
    const metrics: PlannerMetric[] = [
      { name: "Report downloads", why: "Counts how often customers download their reports.", churn: "", category: "Engagement" },
      { name: "Open support tickets", why: "", churn: "", category: "Support" },
      { name: "Telepathy score", why: "", churn: "", category: "Satisfaction" },
    ];
    const data = {
      customers: [{ customer_id: "A" }],
      support: [{ customer_id: "A", ticket_id: "T1", status: "open", created_date: daysAgo(1) }],
    } as unknown as IngestedData;
    const list = metricsWithoutData(assessCoverage(data, metrics), metrics);
    const names = list.map((m) => m.name);
    expect(names).toContain("Report downloads");
    expect(names).toContain("Telepathy score");
    expect(names).not.toContain("Open support tickets");
    expect(list.find((m) => m.name === "Report downloads")!.hint).toBe(metrics[0]!.why);
    expect(list.find((m) => m.name === "Telepathy score")!.hint).toBe("Add data that records telepathy score.");
  });
});
