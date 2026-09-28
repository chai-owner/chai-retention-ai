import { describe, expect, it } from "vitest";
import { resolveMetric } from "@/lib/metric-resolution";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";

// A measure only uses data that is genuinely its kind: CRM activities feed
// activity measures only; usage and support measures need a real match.
const m = (name: string, why: string, category = "Engagement"): PlannerMetric => ({
  name,
  why,
  churn: "Fewer of these usage or activity counts can signal churn.",
  category,
});

const zohoActivity = (id: string, date: string) => ({
  __source: "zoho_crm",
  customer_id: id,
  date,
  activity_date: date,
  activity_type: "call",
  activity_count: "1",
  activity_owner: "Sam",
  logins: "",
  features_used: "",
  active_minutes: "",
});

const zoho = {
  usage: [zohoActivity("A", "2026-09-10"), zohoActivity("A", "2026-09-12"), zohoActivity("B", "2026-09-01")],
} as unknown as IngestedData;

describe("CRM activity data never feeds non-activity measures", () => {
  const nonActivity = [
    m("Security Compliance Report Downloads", "Count of report downloads shows ongoing product usage and activity"),
    m("Admin Portal Login Cadence", "How often admins log in; login frequency and activity count"),
    m("Unresolved Vulnerability Support Tickets", "Count of open support tickets and activity", "Support"),
    m("Endpoint Protection Coverage Trend", "Trend in coverage rate across usage activity"),
  ];
  for (const metric of nonActivity) {
    it(`${metric.name} is left out rather than counting Zoho activities`, () => {
      const r = resolveMetric(metric, zoho);
      expect(r.field ?? "").not.toMatch(/^activity/);
      expect(r.values.size).toBe(0);
    });
  }

  it("activity measures still use the activity data", () => {
    const now = Date.parse("2026-09-20T00:00:00Z");
    const recency = resolveMetric(m("Days since last activity", "Days since the last logged activity"), zoho, now);
    expect(recency.field).toBe("activity_date");
    expect(recency.values.get("A")).toBe(8);
    const freq = resolveMetric(m("Activity frequency", "Activities per account over the last 90 days"), zoho, now);
    expect(freq.field).toBe("activity_count");
    expect(freq.values.get("A")).toBe(2);
  });
});

describe("genuine columns still match", () => {
  it("a real logins column in a usage upload feeds a logins measure", () => {
    const data = {
      usage: [
        { __source: "csv", customer_id: "A", date: "2026-09-10", logins: "12", activity_count: "1" },
        { __source: "csv", customer_id: "B", date: "2026-09-10", logins: "3", activity_count: "1" },
      ],
    } as unknown as IngestedData;
    const r = resolveMetric(m("Admin Portal Login Cadence", "How often admins log in"), data);
    expect(r.field).toBe("logins");
    expect(r.values.get("A")).toBe(12);
  });

  it("Zendesk and Intercom tickets feed a tickets measure once 5 customers have tickets", () => {
    const t = (id: string, cust: string, status: string, src: string) => ({ __source: src, ticket_id: id, customer_id: cust, status, created_date: "2026-09-01" });
    const data = {
      support: [
        t("1", "A", "open", "zendesk"), t("2", "A", "solved", "zendesk"), t("3", "A", "open", "intercom"),
        t("4", "B", "closed", "intercom"), t("5", "C", "open", "zendesk"), t("6", "D", "open", "intercom"), t("7", "E", "solved", "zendesk"),
      ],
      usage: [zohoActivity("A", "2026-09-10")],
    } as unknown as IngestedData;
    const all = resolveMetric(m("Support tickets raised", "Number of support tickets", "Support"), data);
    expect(all.dataset).toBe("support");
    expect(all.values.get("A")).toBe(3);
    const open = resolveMetric(m("Unresolved Vulnerability Support Tickets", "Open tickets", "Support"), data);
    expect(open.values.get("A")).toBe(2);
    expect(open.values.get("B")).toBe(0);
    expect(open.values.size).toBe(5);
  });

  it("a ticket measure with only 3 customers is left out", () => {
    const data = {
      support: ["A", "B", "C"].map((c, i) => ({ ticket_id: String(i), customer_id: c, status: "open", created_date: "2026-09-01" })),
    } as unknown as IngestedData;
    const r = resolveMetric(m("Unresolved Vulnerability Support Tickets", "Open tickets", "Support"), data);
    expect(r.values.size).toBe(0);
  });

  it("description wording alone does not qualify a column", () => {
    const data = { transactions: [{ customer_id: "A", transaction_id: "1", date: "2026-09-10", product: "Plan" }] } as unknown as IngestedData;
    const r = resolveMetric(m("Endpoint Protection Coverage Trend", "Coverage of the product across endpoints"), data);
    expect(r.values.size).toBe(0);
  });

  it("days since last purchase uses the transactions' own dates", () => {
    const now = Date.parse("2026-09-20T00:00:00Z");
    const data = {
      customers: [{ customer_id: "A", signup_date: "2025-01-01" }],
      transactions: [{ customer_id: "A", transaction_id: "1", transaction_date: "2026-09-10", amount: "10" }],
    } as unknown as IngestedData;
    const r = resolveMetric(m("Days since last purchase", "Days since the last purchase", "Transactions"), data, now);
    expect(r.dataset).toBe("transactions");
    expect(r.values.get("A")).toBe(10);
  });

  it("related words alone no longer qualify a column", () => {
    const data = { usage: [{ customer_id: "A", date: "2026-09-10", sessions: "9" }] } as unknown as IngestedData;
    // "downloads" is not "sessions", even though both read as usage counts.
    const r = resolveMetric(m("Report Downloads", "Count of report downloads"), data);
    expect(r.values.size).toBe(0);
  });
});
