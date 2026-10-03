// Ported verbatim from src/lib/sync-persist.server.ts.
import type { ExtractedDataset } from "./types.ts";
import { getSupabaseAdmin } from "./client.ts";
import { SOURCE_FIELD, UNKNOWN_SOURCE } from "./types.ts";
import { customerKeyForRow } from "./row-validation.ts";
import { assertCustomerCapacity } from "./plan-limits.ts";

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}
function toDateOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function rowsAsObjects(ds: ExtractedDataset, source: string): Record<string, string>[] {
  return ds.rows.map((r) => {
    const o: Record<string, string> = {};
    ds.headers.forEach((h, i) => (o[h] = r[i] ?? ""));
    o[SOURCE_FIELD] = source || UNKNOWN_SOURCE;
    return o;
  });
}

const CHUNK = 500;
async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
}

export interface PersistResult {
  batchIds: string[];
  totalRows: number;
}

export async function persistDatasetsAdmin(
  userId: string,
  sourceKind: "crm" | "accounting" | "support",
  sourceProvider: string,
  datasets: ExtractedDataset[],
): Promise<PersistResult> {
  const supabaseAdmin = await getSupabaseAdmin();
  const batchIds: string[] = [];
  let totalRows = 0;

  for (const ds of datasets) {
    const rowObjs = rowsAsObjects(ds, sourceProvider);
    if (rowObjs.length === 0) continue;

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("ingest_batches")
      .insert({
        user_id: userId,
        source_kind: sourceKind,
        source_provider: sourceProvider,
        dataset_key: ds.key,
        filename: null,
        row_count: rowObjs.length,
        status: "ok",
        // deno-lint-ignore no-explicit-any
        meta: { automated: true, datasetLabel: ds.label } as any,
      })
      .select("id")
      .single();
    if (bErr || !batch) throw new Error(bErr?.message ?? "Failed to record batch");
    const batchId = batch.id as string;
    batchIds.push(batchId);
    totalRows += rowObjs.length;

    try {
      if (ds.key === "customers") {
        const payload = rowObjs
          .map((r) => ({ r, key: customerKeyForRow(r) }))
          .filter((x): x is { r: Record<string, string>; key: string } => x.key !== null)
          .map(({ r, key }) => ({
            user_id: userId,
            batch_id: batchId,
            customer_id: key,
            data: r,
          }));
        await assertCustomerCapacity(
          supabaseAdmin,
          userId,
          payload.map((p) => p.customer_id),
        );

        await inChunks(payload, async (c) => {
          const { error } = await supabaseAdmin
            .from("ingested_customers")
            .upsert(c, { onConflict: "user_id,customer_id" });
          if (error) throw new Error(error.message);
        });
      } else if (ds.key === "transactions") {
        const payload = rowObjs
          .filter((r) => r["transaction_id"])
          .map((r) => ({
            user_id: userId,
            batch_id: batchId,
            transaction_id: r["transaction_id"],
            customer_id: r["customer_id"] || null,
            amount: toNumberOrNull(r["amount"]),
            occurred_at: toDateOrNull(r["transaction_date"] ?? r["date"]),
            due_date: toDateOrNull(r["due_date"]),
            amount_due: toNumberOrNull(r["amount_due"]),
            paid_date: toDateOrNull(r["paid_date"]),
            days_overdue: toNumberOrNull(r["days_overdue"]),
            data: r,
          }));
        await inChunks(payload, async (c) => {
          const { error } = await supabaseAdmin
            .from("ingested_transactions")
            .upsert(c, { onConflict: "user_id,transaction_id" });
          if (error) throw new Error(error.message);
        });
      } else if (ds.key === "support") {
        const payload = rowObjs
          .filter((r) => r["ticket_id"])
          .map((r) => ({
            user_id: userId,
            batch_id: batchId,
            ticket_id: r["ticket_id"],
            customer_id: r["customer_id"] || null,
            data: r,
          }));
        await inChunks(payload, async (c) => {
          const { error } = await supabaseAdmin
            .from("ingested_support")
            .upsert(c, { onConflict: "user_id,ticket_id" });
          if (error) throw new Error(error.message);
        });
      }
    } catch (err) {
      await supabaseAdmin
        .from("ingest_batches")
        .update({ status: "error", error: (err as Error).message })
        .eq("id", batchId);
      throw err;
    }
  }

  return { batchIds, totalRows };
}
