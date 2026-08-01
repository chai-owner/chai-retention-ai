// Tier 2 — automated sync persistence. Guarantees a refresh updates existing
// records (upsert on the natural key) instead of duplicating history, and that
// a failed write marks the batch as errored.
import { describe, it, expect } from "vitest";
import { persistDatasetsAdmin } from "@/lib/sync-persist.server";
import { setSupabaseResult, setDefaultSupabaseResult, supabaseMock } from "@/test/setup";
import type { ExtractedDataset } from "@/lib/ingest.functions";

// Each `from(table)` call returns a fresh chainable builder; pick the one
// matching the given call occurrence (defaults to the first).
function builderFor(table: string, occurrence = 0) {
  const idxs = supabaseMock.from.mock.calls
    .map((c, i) => (c[0] === table ? i : -1))
    .filter((i) => i !== -1);
  const idx = idxs[occurrence];
  return idx == null ? undefined : (supabaseMock.from.mock.results[idx].value as Record<string, any>);
}


const customers: ExtractedDataset = {
  key: "customers",
  label: "Customers",
  headers: ["customer_id", "name"],
  rows: [
    ["CUST-1", "Acme"],
    ["", "Missing id"],
  ],
  confidence: 90,
  note: "",
};

const transactions: ExtractedDataset = {
  key: "transactions",
  label: "Transactions",
  headers: ["transaction_id", "customer_id", "amount", "transaction_date"],
  rows: [["TX-1", "CUST-1", "$1,250.50", "2026-05-02"]],
  confidence: 90,
  note: "",
};

const support: ExtractedDataset = {
  key: "support",
  label: "Support",
  headers: ["ticket_id", "customer_id", "status"],
  rows: [["T-1", "CUST-1", "open"]],
  confidence: 90,
  note: "",
};

describe("persistDatasetsAdmin", () => {
  it("records a batch per dataset and counts the rows written", async () => {
    setSupabaseResult("ingest_batches", { data: { id: "batch-1" } });
    const res = await persistDatasetsAdmin("user-1", "crm", "hubspot", [customers, transactions]);
    expect(res.batchIds).toEqual(["batch-1", "batch-1"]);
    expect(res.totalRows).toBe(3);
  });

  it("upserts customers on user + customer_id so a re-sync updates in place", async () => {
    setSupabaseResult("ingest_batches", { data: { id: "batch-1" } });
    await persistDatasetsAdmin("user-1", "crm", "hubspot", [customers]);

    const [payload, opts] = builderFor("ingested_customers")!.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,customer_id" });
    // Rows without a customer id are skipped rather than written as blanks.
    expect(payload).toEqual([
      {
        user_id: "user-1",
        batch_id: "batch-1",
        customer_id: "CUST-1",
        data: { customer_id: "CUST-1", name: "Acme" },
      },
    ]);
  });

  it("parses currency and dates when persisting transactions", async () => {
    setSupabaseResult("ingest_batches", { data: { id: "batch-1" } });
    await persistDatasetsAdmin("user-1", "accounting", "xero", [transactions]);

    const [payload, opts] = builderFor("ingested_transactions")!.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,transaction_id" });
    expect(payload[0]).toMatchObject({
      transaction_id: "TX-1",
      customer_id: "CUST-1",
      amount: 1250.5,
      occurred_at: "2026-05-02",
    });
  });

  it("upserts support tickets on the ticket id", async () => {
    setSupabaseResult("ingest_batches", { data: { id: "batch-1" } });
    await persistDatasetsAdmin("user-1", "support", "zendesk", [support]);

    const [payload, opts] = builderFor("ingested_support")!.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,ticket_id" });
    expect(payload[0]).toMatchObject({ ticket_id: "T-1", customer_id: "CUST-1" });
  });

  it("skips empty datasets without recording a batch", async () => {
    const res = await persistDatasetsAdmin("user-1", "crm", "hubspot", [
      { ...customers, rows: [] },
    ]);
    expect(res).toEqual({ batchIds: [], totalRows: 0 });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("fails loudly when the batch record cannot be created", async () => {
    setSupabaseResult("ingest_batches", { data: null, error: { message: "insert denied" } });
    await expect(persistDatasetsAdmin("user-1", "crm", "hubspot", [customers])).rejects.toThrow(
      /insert denied/,
    );
  });

  it("marks the batch as errored when the row write fails", async () => {
    setSupabaseResult("ingest_batches", { data: { id: "batch-1" } });
    setDefaultSupabaseResult({ data: null, error: { message: "row write failed" } });
    setSupabaseResult("ingested_customers", { data: null, error: { message: "row write failed" } });

    await expect(persistDatasetsAdmin("user-1", "crm", "hubspot", [customers])).rejects.toThrow(
      /row write failed/,
    );
    const batches = builderFor("ingest_batches", 1)!;
    expect(batches.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error: "row write failed" }),
    );
  });
});
