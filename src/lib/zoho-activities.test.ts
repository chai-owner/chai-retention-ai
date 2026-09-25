// Zoho CRM paging + activity mapping, and how activity rows feed the two new
// engagement metrics.
import { describe, it, expect } from "vitest";
import {
  ZOHO_PAGE_SIZE,
  ZOHO_ACTIVITY_MODULES,
  fetchZohoPages,
  buildZohoDatasets,
} from "@/lib/zoho.server";
import { resolveMetric } from "@/lib/metric-resolution";
import { plannerMetrics } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";

type Rec = Record<string, unknown>;

/** Fake Zoho module holding `total` records, paged the way Zoho v6 pages. */
function pagedModule(total: number, make: (i: number) => Rec) {
  const all = Array.from({ length: total }, (_, i) => make(i));
  const calls: string[] = [];
  const get = async (path: string) => {
    calls.push(path);
    const perPage = Number(new URL(`http://x${path}`).searchParams.get("per_page") ?? 200);
    const page = Number(new URL(`http://x${path}`).searchParams.get("page") ?? 1);
    const start = (page - 1) * perPage;
    const data = all.slice(start, start + perPage);
    return { data, info: { more_records: start + perPage < all.length } };
  };
  return { get, calls, all };
}

describe("Zoho paging", () => {
  it("pages past the 200-record ceiling instead of stopping at the first page", async () => {
    const { get, calls } = pagedModule(470, (i) => ({ id: `d${i}` }));
    const rows = await fetchZohoPages(get, "Deals", ["Amount"], 1000);
    expect(rows).toHaveLength(470);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain(`per_page=${ZOHO_PAGE_SIZE}`);
    expect(calls[1]).toContain("page=2");
  });

  it("stops at the requested ceiling", async () => {
    const { get } = pagedModule(1000, (i) => ({ id: `d${i}` }));
    const rows = await fetchZohoPages(get, "Deals", ["Amount"], 250);
    expect(rows).toHaveLength(250);
  });

  it("treats an unchanged module (304) and an empty module (204) as no rows", async () => {
    const rows = await fetchZohoPages(async () => null, "Deals", ["Amount"], 500);
    expect(rows).toEqual([]);
  });

  it("follows Zoho's page token when it is returned", async () => {
    const seen: string[] = [];
    const get = async (path: string) => {
      seen.push(path);
      if (seen.length === 1) {
        return { data: [{ id: "a" }], info: { more_records: true, next_page_token: "tok-2" } };
      }
      return { data: [{ id: "b" }], info: { more_records: false } };
    };
    const rows = await fetchZohoPages(get, "Calls", ["Subject"], 500);
    expect(rows).toHaveLength(2);
    expect(seen[1]).toContain("page_token=tok-2");
  });
});

const moduleFor = (name: string) => ZOHO_ACTIVITY_MODULES.find((m) => m.module === name)!;

describe("Zoho activity mapping", () => {
  const raw = {
    accounts: [
      { id: "ACC1", Account_Name: "Brightwell", Created_Time: "2024-02-01T10:00:00+00:00" },
      { id: "ACC2", Account_Name: "Harborline", Created_Time: "2023-06-01T10:00:00+00:00" },
    ],
    deals: [
      { id: "DEAL1", Deal_Name: "Renewal", Amount: 1200, Closing_Date: "2026-08-01", Account_Name: { id: "ACC1", name: "Brightwell" } },
    ],
    contacts: [{ id: "CON1", Email: "ops@brightwell.com", Account_Name: { id: "ACC2" } }],
    activities: [
      {
        type: "call",
        module: moduleFor("Calls"),
        records: [
          // Logged straight against the account.
          { id: "C1", Subject: "Check-in", Call_Start_Time: "2026-09-10T09:00:00+00:00", Owner: { name: "Sam" }, What_Id: { id: "ACC1" }, $se_module: "Accounts" },
          // Logged against a deal — must roll up to that deal's account.
          { id: "C2", Subject: "Pricing", Call_Start_Time: "2026-09-12T09:00:00+00:00", What_Id: { id: "DEAL1" }, $se_module: "Deals" },
          // Logged against a contact only — resolves via the contact's account.
          { id: "C3", Subject: "Intro", Call_Start_Time: "2026-09-13T09:00:00+00:00", Who_Id: { id: "CON1" } },
          // Messy rows: orphaned, and undated.
          { id: "C4", Subject: "Orphan", Call_Start_Time: "2026-09-13T09:00:00+00:00" },
          { id: "C5", Subject: "No date", What_Id: { id: "ACC1" }, $se_module: "Accounts" },
        ],
      },
      {
        type: "note",
        module: moduleFor("Notes"),
        records: [
          { id: "N1", Note_Title: "Renewal risk", Created_Time: "2026-09-14T09:00:00+00:00", Parent_Id: { id: "ACC1" }, $se_module: "Accounts" },
        ],
      },
    ],
  };

  const datasets = buildZohoDatasets(raw);
  const usage = datasets.find((d) => d.key === "usage")!;
  const rows = usage.rows.map((r) => Object.fromEntries(usage.headers.map((h, i) => [h, r[i]])));

  it("keeps the existing customer and transaction datasets unchanged", () => {
    const customers = datasets.find((d) => d.key === "customers")!;
    expect(customers.rows).toHaveLength(2);
    const transactions = datasets.find((d) => d.key === "transactions")!;
    expect(transactions.rows[0]).toEqual(["ACC1", "DEAL1", "1200", "2026-08-01", "Renewal", "USD", expect.any(String), expect.stringMatching(/^(won|lost|open)$/)]);
  });

  it("groups activities onto the owning account via account, deal and contact", () => {
    expect(rows.map((r) => r.event_id)).toEqual([
      "zoho-call-C1",
      "zoho-call-C2",
      "zoho-call-C3",
      "zoho-note-N1",
    ]);
    expect(rows.map((r) => r.customer_id)).toEqual(["ACC1", "ACC1", "ACC2", "ACC1"]);
  });

  it("drops activities with no resolvable account or no usable date", () => {
    expect(rows.find((r) => r.activity_subject === "Orphan")).toBeUndefined();
    expect(rows.find((r) => r.activity_subject === "No date")).toBeUndefined();
  });

  it("carries a stable id, type, owner and a countable 1 per activity", () => {
    expect(rows[0]).toMatchObject({
      activity_type: "call",
      activity_owner: "Sam",
      activity_date: "2026-09-10",
      date: "2026-09-10",
      activity_count: "1",
    });
  });
});

describe("engagement metrics over activity rows", () => {
  const recency = plannerMetrics.find((m) => m.name === "Days since last activity")!;
  const frequency = plannerMetrics.find((m) => m.name === "Activity frequency")!;
  const now = Date.parse("2026-09-20T00:00:00Z");
  const day = 86400000;
  const iso = (d: number) => new Date(now - d * day).toISOString().slice(0, 10);

  const data = {
    usage: [
      { customer_id: "A", date: iso(2), activity_date: iso(2), activity_type: "call", activity_count: "1" },
      { customer_id: "A", date: iso(30), activity_date: iso(30), activity_type: "note", activity_count: "1" },
      { customer_id: "A", date: iso(200), activity_date: iso(200), activity_type: "task", activity_count: "1" },
      { customer_id: "B", date: iso(150), activity_date: iso(150), activity_type: "call", activity_count: "1" },
    ],
  } as unknown as IngestedData;

  it("defaults both metrics to a modest weight", () => {
    expect(recency.weight).toBe(2);
    expect(frequency.weight).toBe(2);
  });

  it("measures days since the most recent activity", () => {
    const resolved = resolveMetric(recency, data, now);
    expect(resolved.dataset).toBe("usage");
    expect(resolved.values.get("A")).toBe(2);
    expect(resolved.values.get("B")).toBe(150);
  });

  it("counts activity over a 90-day window, so a silent account reads zero", () => {
    const resolved = resolveMetric(frequency, data, now);
    expect(resolved.values.get("A")).toBe(2);
    expect(resolved.values.get("B")).toBe(0);
  });
});
