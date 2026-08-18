import { describe, it, expect } from "vitest";
import {
  INGEST_COLUMNS,
  normalizeIngestRow,
  fetchAllPages,
  INGEST_PAGE,
  batchSource,
} from "@/lib/ingest-row-normalize";
import { sourceLabel } from "@/lib/customer-matching";

describe("normalizeIngestRow", () => {
  it("recovers canonical fields that live only in the DB columns", () => {
    const row = normalizeIngestRow(
      {
        data: { membership_fee: 50, payment_status: "paid" },
        transaction_id: "T1",
        customer_id: "GYM001",
        amount: 50,
        occurred_at: "2026-08-03",
      },
      INGEST_COLUMNS.transactions!,
    );
    expect(row.customer_id).toBe("GYM001");
    expect(row.amount).toBe("50");
    expect(row.transaction_date).toBe("2026-08-03");
    expect(row.membership_fee).toBe("50");
  });

  it("never overwrites a value the payload already carries", () => {
    const row = normalizeIngestRow(
      { data: { customer_id: "FROM-BLOB" }, customer_id: "FROM-COLUMN" },
      INGEST_COLUMNS.customers!,
    );
    expect(row.customer_id).toBe("FROM-BLOB");
  });

  it("stringifies non-string payload values", () => {
    const row = normalizeIngestRow({ data: { peak: true, count: 3 } }, []);
    expect(row).toEqual({ peak: "true", count: "3" });
  });

  it("preserves nested provider payloads for generic metric resolution", () => {
    const row = normalizeIngestRow(
      { data: { activity: { workout_duration_minutes: 64, peak_hour: true } }, customer_id: "GYM1" },
      INGEST_COLUMNS.usage!,
    );
    expect(row.activity).toBe('{"workout_duration_minutes":64,"peak_hour":true}');
    expect(row.customer_id).toBe("GYM1");
  });
});

describe("fetchAllPages", () => {
  it("keeps paging until a short page comes back", async () => {
    const total = INGEST_PAGE + 730;
    const all = Array.from({ length: total }, (_, i) => ({ i }));
    const rows = await fetchAllPages(
      async (from, to) => ({ data: all.slice(from, to + 1), error: null }),
      "usage",
    );
    expect(rows).toHaveLength(total);
  });

  it("throws (rather than returning nothing) when a page fails", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: { message: "boom" } }), "usage"),
    ).rejects.toThrow(/usage: boom/);
  });
});

describe("source inference", () => {
  it("maps batch kinds/providers to a platform tag", () => {
    expect(batchSource("upload", "csv")).toBe("csv");
    expect(batchSource("test", "manual")).toBe("csv");
    expect(batchSource("drop", "chai")).toBe("drop");
    expect(batchSource("crm", "hubspot")).toBe("hubspot");
    expect(batchSource("support", "zendesk")).toBe("zendesk");
    expect(batchSource("accounting", "xero")).toBe("xero");
  });

  it("falls back to the batch source when the row has no __source", () => {
    const row = normalizeIngestRow(
      { data: { customer_name: "Member 16" }, customer_id: "GYM016" },
      INGEST_COLUMNS.customers!,
      "csv",
    );
    expect(row.__source).toBe("csv");
    expect(sourceLabel(row.__source!)).toBe("CSV upload");
  });

  it("keeps an existing __source over the batch fallback", () => {
    const row = normalizeIngestRow(
      { data: { __source: "xero" }, customer_id: "X1" },
      INGEST_COLUMNS.customers!,
      "csv",
    );
    expect(row.__source).toBe("xero");
  });
});
