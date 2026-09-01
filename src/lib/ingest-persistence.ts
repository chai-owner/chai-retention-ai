// Client-side glue for the ingest-persistence server functions. Wizards call
// `persistBatch(...)` after they've updated the local stores; on app boot
// `hydrateIngestFromServer()` loads persisted rows + batch history back into
// those stores so history survives refresh and follows the user.
import { toast } from "sonner";
import { isPlanLimitMessage, raisePlanLimitNotice } from "@/lib/plan-limit-store";
import { ingestedStore, type IngestRow } from "@/lib/ingested-data-store";
import { uploadsStore, type UploadRecord } from "@/lib/uploads-store";
import {
  saveIngestBatch,
  listAllIngested,
  listIngestBatches,
  deleteIngestBatch,
} from "@/lib/ingest-persistence.functions";

export interface PersistBatchArgs {
  source_kind: "upload" | "crm" | "accounting" | "drop";
  source_provider: string;
  dataset_key: string;
  filename?: string | null;
  rows: IngestRow[];
  // Optional metadata for uploads (quality, completeness, findings, etc.).
  meta?: Record<string, unknown>;
  // If provided, the client-side uploadsStore record with this id will be
  // relabeled to the DB batch id once the save succeeds so future deletes
  // hit the real row.
  localUploadId?: string;
}

export async function persistBatch(args: PersistBatchArgs): Promise<{ batchId: string } | null> {
  try {
    const { localUploadId, ...payload } = args;
    const res = await saveIngestBatch({ data: payload });
    if (localUploadId) uploadsStore.replaceId(localUploadId, res.batchId);
    return { batchId: res.batchId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save to your account";
    if (isPlanLimitMessage(message)) {
      // Nothing was imported server-side — drop the optimistic local rows too.
      raisePlanLimitNotice(message);
      toast.error("Import blocked by your plan limit", { description: message });
      void hydrateIngestFromServer();
      return null;
    }
    toast.error("Saved locally, but not to your account", { description: message });
    return null;
  }
}

export async function hydrateIngestFromServer(options?: { surfaceError?: boolean }): Promise<boolean> {
  ingestedStore.beginHydration();
  try {
    // The assessment rows are the critical read. Upload history is useful UI
    // metadata, but a history failure must never discard a successful row
    // snapshot and make a populated account look empty.
    const snapshot = await listAllIngested();
    let batches: Awaited<ReturnType<typeof listIngestBatches>> = [];
    try {
      batches = await listIngestBatches();
    } catch (err) {
      console.warn("Failed to hydrate ingest batch history", err);
    }
    // Reset stores to whatever the DB says — the DB is now the source of truth.
    ingestedStore.clear();
    for (const key of ["customers", "transactions", "support", "usage", "surveys"] as const) {
      const rows = snapshot[key];
      if (rows && rows.length) ingestedStore.addRows(key, rows as IngestRow[]);
    }
    uploadsStore.clear();
    // Rebuild upload history in chronological (oldest-first) order so the
    // store's own prepending puts newest first.
    const chronological = [...batches].reverse();
    for (const b of chronological) {
      const meta = (b.meta ?? {}) as Record<string, unknown>;
      const record: UploadRecord = {
        id: b.id,
        fileName: b.filename ?? sourceLabel(b.source_kind, b.source_provider),
        datasetKey: b.dataset_key,
        datasetLabel:
          (typeof meta.datasetLabel === "string" && meta.datasetLabel) || b.dataset_key,
        uploadedAt: b.created_at.slice(0, 16).replace("T", " "),
        rows: b.row_count,
        sizeKb: typeof meta.sizeKb === "number" ? meta.sizeKb : 0,
        reliability: typeof meta.reliability === "number" ? meta.reliability : 100,
        completeness: typeof meta.completeness === "number" ? meta.completeness : 100,
        findings: Array.isArray(meta.findings) ? (meta.findings as UploadRecord["findings"]) : [],
        fieldChecks: Array.isArray(meta.fieldChecks) ? (meta.fieldChecks as UploadRecord["fieldChecks"]) : [],
      };
      uploadsStore.add(record);
    }
    ingestedStore.markHydrated();
    return true;
  } catch (err) {
    // Keep whatever is already in memory — a failed load must never look like
    // "this account has no data".
    console.warn("Failed to hydrate ingested data", err);
    ingestedStore.markHydrated();
    if (options?.surfaceError) throw err;
    return false;
  }
}


function sourceLabel(kind: string, provider: string) {
  if (kind === "crm") return `${provider} sync`;
  if (kind === "accounting") return `${provider} sync`;
  if (kind === "support") return `${provider} sync`;
  if (kind === "drop") return "Smart data drop";
  return "Upload";
}

export async function removePersistedBatch(id: string) {
  try {
    await deleteIngestBatch({ data: { id } });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove from your account";
    toast.error("Removed locally only", { description: message });
    return false;
  }
}
