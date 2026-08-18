import { describe, it, expect } from "vitest";
import {
  INGEST_COLUMNS,
  normalizeIngestRow,
  fetchAllPages,
  INGEST_PAGE,
} from "@/lib/ingest-row-normalize";

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
