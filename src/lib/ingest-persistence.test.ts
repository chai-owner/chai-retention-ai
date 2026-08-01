// Tier 2 — client-side persistence glue. Every upload / drop / sync must reach
// the user's account, and a failure must degrade gracefully rather than lose
// the data the user just added locally.
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveIngestBatch = vi.fn(async (_args?: unknown) => ({ batchId: "batch-99" }));
const listAllIngested = vi.fn(async () => ({}) as Record<string, unknown>);
const listIngestBatches = vi.fn(async () => [] as unknown[]);
const deleteIngestBatch = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/ingest-persistence.functions", () => ({
  saveIngestBatch: (...a: unknown[]) => saveIngestBatch(...(a as [])),
  listAllIngested: () => listAllIngested(),
  listIngestBatches: () => listIngestBatches(),
  deleteIngestBatch: (...a: unknown[]) => deleteIngestBatch(...(a as [])),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { persistBatch, hydrateIngestFromServer, removePersistedBatch } from "@/lib/ingest-persistence";
import { ingestedStore } from "@/lib/ingested-data-store";
import { uploadsStore } from "@/lib/uploads-store";

beforeEach(() => {
  vi.clearAllMocks();
  saveIngestBatch.mockResolvedValue({ batchId: "batch-99" });
  ingestedStore.clear();
  uploadsStore.clear();
});

describe("persistBatch", () => {
  it("sends the batch to the account and returns its id", async () => {
    const rows = [{ customer_id: "CUST-1", name: "Acme" }];
    const res = await persistBatch({
      source_kind: "upload",
      source_provider: "csv",
      dataset_key: "customers",
      filename: "customers.csv",
      rows,
    });

    expect(res).toEqual({ batchId: "batch-99" });
    expect(saveIngestBatch).toHaveBeenCalledWith({
      data: {
        source_kind: "upload",
        source_provider: "csv",
        dataset_key: "customers",
        filename: "customers.csv",
        rows,
      },
    });
  });

  it("does not send the local-only id to the server", async () => {
    await persistBatch({
      source_kind: "drop",
      source_provider: "chai",
      dataset_key: "transactions",
      rows: [],
      localUploadId: "local-1",
    });
    const payload = saveIngestBatch.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(payload.data).not.toHaveProperty("localUploadId");
  });

  it("relabels the local upload record with the saved batch id", async () => {
    uploadsStore.add({
      id: "local-1",
      fileName: "customers.csv",
      datasetKey: "customers",
      datasetLabel: "Customers",
      uploadedAt: "2026-05-01 10:00",
      rows: 1,
      sizeKb: 2,
      reliability: 100,
      completeness: 100,
      findings: [],
      fieldChecks: [],
    });

    await persistBatch({
      source_kind: "upload",
      source_provider: "csv",
      dataset_key: "customers",
      rows: [],
      localUploadId: "local-1",
    });

    expect(uploadsStore.getSnapshot().map((u: { id: string }) => u.id)).toEqual(["batch-99"]);
  });

  it("warns the user but keeps the local data when the save fails", async () => {
    saveIngestBatch.mockRejectedValue(new Error("not signed in"));
    const res = await persistBatch({
      source_kind: "upload",
      source_provider: "csv",
      dataset_key: "customers",
      rows: [],
    });

    expect(res).toBeNull();
    expect(toastError).toHaveBeenCalledWith(
      "Saved locally, but not to your account",
      expect.objectContaining({ description: "not signed in" }),
    );
  });
});

describe("hydrateIngestFromServer", () => {
  it("rebuilds the ingested rows from the account", async () => {
    listAllIngested.mockResolvedValue({
      customers: [{ customer_id: "CUST-1" }],
      transactions: [{ transaction_id: "TX-1" }],
    });

    await hydrateIngestFromServer();

    const snap = ingestedStore.getSnapshot();
    expect(snap.customers).toHaveLength(1);
    expect(snap.transactions).toHaveLength(1);
  });

  it("rebuilds upload history newest-first with saved quality metadata", async () => {
    listIngestBatches.mockResolvedValue([
      {
        id: "b2",
        filename: null,
        source_kind: "crm",
        source_provider: "hubspot",
        dataset_key: "customers",
        row_count: 20,
        created_at: "2026-05-05T09:30:00Z",
        meta: { datasetLabel: "Customers", reliability: 88, completeness: 91 },
      },
      {
        id: "b1",
        filename: "old.csv",
        source_kind: "upload",
        source_provider: "csv",
        dataset_key: "customers",
        row_count: 5,
        created_at: "2026-05-01T09:00:00Z",
        meta: {},
      },
    ]);

    await hydrateIngestFromServer();

    const uploads = uploadsStore.getSnapshot();
    expect(uploads.map((u: { id: string }) => u.id)).toEqual(["b2", "b1"]);
    expect(uploads[0]).toMatchObject({
      fileName: "hubspot sync",
      datasetLabel: "Customers",
      rows: 20,
      reliability: 88,
      completeness: 91,
      uploadedAt: "2026-05-05 09:30",
    });
    // Missing metadata falls back to sane defaults rather than NaN/undefined.
    expect(uploads[1]).toMatchObject({ fileName: "old.csv", reliability: 100, completeness: 100 });
  });

  it("never throws when the account can't be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    listAllIngested.mockRejectedValue(new Error("offline"));
    await expect(hydrateIngestFromServer()).resolves.toBeUndefined();
  });
});

describe("removePersistedBatch", () => {
  it("deletes the batch from the account", async () => {
    expect(await removePersistedBatch("b1")).toBe(true);
    expect(deleteIngestBatch).toHaveBeenCalledWith({ data: { id: "b1" } });
  });

  it("tells the user when the delete only applied locally", async () => {
    deleteIngestBatch.mockRejectedValue(new Error("permission denied"));
    expect(await removePersistedBatch("b1")).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      "Removed locally only",
      expect.objectContaining({ description: "permission denied" }),
    );
  });
});
