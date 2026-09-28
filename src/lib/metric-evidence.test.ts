import { describe, expect, it } from "vitest";
import { applyEvidenceRules, MIN_CUSTOMER_RECORDS, MIN_PEERS, NOT_ENOUGH_DATA_LABEL } from "@/lib/metric-evidence";
import { MIN_DEAL_PEERS } from "@/lib/countable-transactions";
import { MIN_TICKET_PEERS, resolveMetric } from "@/lib/metric-resolution";
import { scoreCustomers } from "@/lib/customer-scoring";
import { buildRealDataset } from "@/lib/real-scoring";
import { makeProfile } from "@/test/fixtures";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `C${i}`);
const vals = (list: string[]) => new Map(list.map((id, i) => [id, i]));
const counts = (list: string[], c: number) => new Map(list.map((id) => [id, c]));

describe("shared evidence rules", () => {
  it("one shared minimum: 3 records, 5 customers; deals and tickets use it", () => {
    expect(MIN_CUSTOMER_RECORDS).toBe(3);
    expect(MIN_PEERS).toBe(5);
    expect(MIN_DEAL_PEERS).toBe(MIN_PEERS);
    expect(MIN_TICKET_PEERS).toBe(MIN_PEERS);
    expect(NOT_ENOUGH_DATA_LABEL).toBe("Not enough data yet — scored after 3 records");
  });

  it("rule 1: customers with fewer than 3 records are left out", () => {
    const list = ids(6);
    const c = counts(list, 3);
    c.set("C0", 2);
    const out = applyEvidenceRules(vals(list), c, "average");
    expect(out.has("C0")).toBe(false);
    expect(out.size).toBe(5);
  });

  it("rule 2: fewer than 5 qualifying customers leaves the measure out for everyone", () => {
    const list = ids(5);
    const c = counts(list, 3);
    c.set("C4", 1);
    expect(applyEvidenceRules(vals(list), c, "sum").size).toBe(0);
  });

  it("recency and single-value measures are exempt", () => {
    const list = ids(1);
    expect(applyEvidenceRules(vals(list), counts(list, 1), "days_since_last").size).toBe(1);
    expect(applyEvidenceRules(vals(list), counts(list, 1), "latest").size).toBe(1);
  });
});

const activity: PlannerMetric = { name: "Activity frequency", why: "Activities per account over the last 90 days", churn: "", category: "Engagement" };
const recency: PlannerMetric = { name: "Days since last activity", why: "Days since the last logged activity", churn: "", category: "Engagement" };
const act = (id: string, date: string) => ({ __source: "zoho_crm", customer_id: id, date, activity_date: date, activity_type: "call", activity_count: "1" });
const NOW = Date.parse("2026-09-20T00:00:00Z");

describe("thin CRM activity (1–2 each) never produces scores from comparisons", () => {
  const thin = {
    customers: ids(7).map((customer_id) => ({ customer_id })),
    usage: ids(7).flatMap((id, i) => (i % 2 ? [act(id, "2026-09-10")] : [act(id, "2026-09-10"), act(id, "2026-09-12")])),
  } as unknown as IngestedData;

  it("activity frequency is left out; days since last activity still scores", () => {
    expect(resolveMetric(activity, thin, NOW).values.size).toBe(0);
    expect(resolveMetric(recency, thin, NOW).values.size).toBe(7);
  });

  it("switches on by itself once 5 customers have 3+ activities, with reason text", () => {
    const grown = {
      customers: ids(5).map((customer_id) => ({ customer_id })),
      usage: ids(5).flatMap((id, i) => Array.from({ length: 3 + i }, (_, k) => act(id, `2026-09-0${k + 1}`))),
    } as unknown as IngestedData;
    expect(resolveMetric(activity, grown, NOW).values.size).toBe(5);
    const row = scoreCustomers([activity], grown, { now: NOW })[0]!;
    const entry = (row.score_breakdown as Array<{ metric: string; comparison?: string }>).find((e) => e.metric === activity.name)!;
    expect(entry.comparison).toBe("Compared with 5 customers who each have at least 3 records.");
  });
});

describe("customers with no scorable measure", () => {
  it("are flagged, sorted last and kept out of risk counts on the customer page", () => {
    const data = {
      customers: [{ customer_id: "X" }, { customer_id: "Y" }],
      usage: [act("X", "2026-09-10")],
    } as unknown as IngestedData;
    const ds = buildRealDataset(data, { [activity.name]: 3 }, makeProfile({ metrics: [activity] }));
    expect(ds.customers.every((c) => c.notEnoughData)).toBe(true);
    const e = ds.executive;
    expect(e.healthy + e.watch + e.atRisk + e.critical).toBe(0);
    expect(ds.revenueAtRisk).toBe(0);
  });

  it("get no nightly score at all", () => {
    const data = { customers: [{ customer_id: "X" }], usage: [act("X", "2026-09-10")] } as unknown as IngestedData;
    expect(scoreCustomers([activity], data, { now: NOW })).toEqual([]);
  });
});

import { resolveMetric as __resolve } from "@/lib/metric-resolution";
import { compareTrend as __trend } from "@/lib/personal-baseline";
describe("undated records (rule 1 correction)", () => {
  it("3 undated tickets qualify for a ticket-count measure", async () => {
    const { applyEvidenceRules, recordsNeedDates } = await import("@/lib/metric-evidence");
    expect(recordsNeedDates("sum", "Support ticket count")).toBe(false);
    const values = new Map(["a", "b", "c", "d", "e"].map((id) => [id, 3]));
    const counts = new Map(["a", "b", "c", "d", "e"].map((id) => [id, 3])); // all undated, counted
    expect(applyEvidenceRules(values, counts, "sum").size).toBe(5);
  });
  it("3 undated records do NOT qualify for a trend or frequency measure", async () => {
    const { recordsNeedDates } = await import("@/lib/metric-evidence");
    expect(recordsNeedDates("sum", "Activity frequency")).toBe(true);
    expect(recordsNeedDates("days_since_last", "Days since last login")).toBe(true);
    expect(__trend([], "sum", "lower", Date.now())).toBeNull();
  });
});
void __resolve;
