// Server functions that persist user-ingested data (uploads, drops, CRM
// syncs, accounting syncs) into the database, and read it back on load so
// that history survives refresh and moves with the user across devices.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Shapes ---------------------------------------------------------------

const IngestRow = z.record(z.string(), z.string());

const SaveBatchInput = z.object({
  source_kind: z.enum(["upload", "crm", "accounting", "support", "drop"]),
  source_provider: z.string().min(1),
  dataset_key: z.string().min(1),
  filename: z.string().nullable().optional(),
  rows: z.array(IngestRow),
  // Optional per-batch quality metadata (mainly for uploads: reliability,
  // completeness, findings, fieldChecks, sizeKb, datasetLabel).
  meta: z.record(z.string(), z.unknown()).optional().default({}),
});

export type SaveBatchInput = z.infer<typeof SaveBatchInput>;

const DeleteBatchInput = z.object({ id: z.string().uuid() });

// ---- Helpers --------------------------------------------------------------

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function toDateOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const CHUNK = 500;

async function chunkedUpsert<T>(
  rows: T[],
  fn: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await fn(chunk);
    if (error) throw new Error(error.message);
  }
}

// ---- saveIngestBatch ------------------------------------------------------

export const saveIngestBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SaveBatchInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const dataset = data.dataset_key;

    // 1. Create the batch row.
    const { data: batchRow, error: batchErr } = await supabase
      .from("ingest_batches")
      .insert({
        user_id: userId,
        source_kind: data.source_kind,
        source_provider: data.source_provider,
        dataset_key: dataset,
        filename: data.filename ?? null,
        row_count: data.rows.length,
        status: "ok",
        meta: (data.meta ?? {}) as never,
      })
      .select("id, created_at")
      .single();
    if (batchErr || !batchRow) throw new Error(batchErr?.message ?? "Failed to record batch");

    const batchId = batchRow.id as string;

    // 2. Fan out rows into the per-dataset table.
    try {
      if (dataset === "customers") {
        const payload = data.rows
          .filter((r) => r["customer_id"])
          .map((r) => ({
            user_id: userId,
            batch_id: batchId,
            customer_id: r["customer_id"],
            data: r,
          }));
        await chunkedUpsert(payload, (chunk) =>
          supabase
            .from("ingested_customers")
            .upsert(chunk, { onConflict: "user_id,customer_id" }),
        );
      } else if (dataset === "transactions") {
        const payload = data.rows
          .filter((r) => r["transaction_id"])
          .map((r) => ({
            user_id: userId,
            batch_id: batchId,
            transaction_id: r["transaction_id"],
            customer_id: r["customer_id"] || null,
            amount: toNumberOrNull(r["amount"]),
            occurred_at: toDateOrNull(r["transaction_date"] ?? r["date"]),
            data: r,
          }));
        await chunkedUpsert(payload, (chunk) =>
          supabase
            .from("ingested_transactions")
            .upsert(chunk, { onConflict: "user_id,transaction_id" }),
        );
      } else if (dataset === "support") {
        const payload = data.rows
          .filter((r) => r["ticket_id"])
          .map((r) => ({
            user_id: userId,
            batch_id: batchId,
            ticket_id: r["ticket_id"],
            customer_id: r["customer_id"] || null,
            data: r,
          }));
        await chunkedUpsert(payload, (chunk) =>
          supabase
            .from("ingested_support")
            .upsert(chunk, { onConflict: "user_id,ticket_id" }),
        );
      } else if (dataset === "usage") {
        const payload = data.rows.map((r) => ({
          user_id: userId,
          batch_id: batchId,
          customer_id: r["customer_id"] || null,
          occurred_at: toDateOrNull(r["date"]),
          data: r,
        }));
        await chunkedUpsert(payload, (chunk) =>
          supabase.from("ingested_usage").insert(chunk),
        );
      } else if (dataset === "surveys") {
        const payload = data.rows.map((r) => ({
          user_id: userId,
          batch_id: batchId,
          customer_id: r["customer_id"] || null,
          submitted_at: toDateOrNull(r["survey_date"] ?? r["date"]),
          data: r,
        }));
        await chunkedUpsert(payload, (chunk) =>
          supabase.from("ingested_surveys").insert(chunk),
        );
      } else {
        // Unknown dataset — batch still recorded, no row fanout.
      }
    } catch (err) {
      // Mark the batch as failed but keep the record so the user sees it.
      await supabase
        .from("ingest_batches")
        .update({ status: "error", error: (err as Error).message })
        .eq("id", batchId);
      throw err;
    }

    return { batchId, count: data.rows.length, created_at: batchRow.created_at };
  });

// ---- listAllIngested ------------------------------------------------------

export interface IngestedSnapshot {
  customers: Array<Record<string, string>>;
  transactions: Array<Record<string, string>>;
  support: Array<Record<string, string>>;
  usage: Array<Record<string, string>>;
  surveys: Array<Record<string, string>>;
}

// Normalized columns are stored alongside the raw `data` blob. Older/imported
// rows can have the canonical fields ONLY in those columns (the blob keeps the
// provider's original shape), so the blob alone loses customer_id / amount /
// dates and everything downstream scores as unattributed. Always merge the
// columns back in, and never let the blob's own value be overwritten.
type Col = { from: string; to: string[] };

const COLUMNS: Record<string, Col[]> = {
  customers: [{ from: "customer_id", to: ["customer_id"] }],
  transactions: [
    { from: "transaction_id", to: ["transaction_id"] },
    { from: "customer_id", to: ["customer_id"] },
    { from: "amount", to: ["amount"] },
    { from: "occurred_at", to: ["transaction_date", "date"] },
  ],
  support: [
    { from: "ticket_id", to: ["ticket_id"] },
    { from: "customer_id", to: ["customer_id"] },
  ],
  usage: [
    { from: "customer_id", to: ["customer_id"] },
    { from: "occurred_at", to: ["date", "occurred_at"] },
  ],
  surveys: [
    { from: "customer_id", to: ["customer_id"] },
    { from: "submitted_at", to: ["survey_date", "date", "submitted_at"] },
  ],
};

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function toRow(raw: Record<string, unknown>, cols: Col[]): Record<string, string> {
  const blob = (raw["data"] as Record<string, unknown> | null) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(blob)) out[k] = stringify(v);
  for (const c of cols) {
    const v = stringify(raw[c.from]);
    if (!v) continue;
    for (const target of c.to) if (!out[target]) out[target] = v;
  }
  return out;
}

// PostgREST caps a single response (db-max-rows), so read in pages — otherwise
// large datasets silently arrive truncated.
const PAGE = 1000;

async function fetchAll(
  q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  label: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export const listAllIngested = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IngestedSnapshot> => {
    const { supabase, userId } = context;
    const read = (table: string, select: string) =>
      fetchAll(
        (from, to) =>
          supabase
            .from(table as "ingested_customers")
            .select(select)
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to) as never,
        table,
      );

    const [c, t, s, u, sv] = await Promise.all([
      read("ingested_customers", "data, customer_id"),
      read("ingested_transactions", "data, transaction_id, customer_id, amount, occurred_at"),
      read("ingested_support", "data, ticket_id, customer_id"),
      read("ingested_usage", "data, customer_id, occurred_at"),
      read("ingested_surveys", "data, customer_id, submitted_at"),
    ]);

    return {
      customers: c.map((r) => toRow(r, COLUMNS.customers!)),
      transactions: t.map((r) => toRow(r, COLUMNS.transactions!)),
      support: s.map((r) => toRow(r, COLUMNS.support!)),
      usage: u.map((r) => toRow(r, COLUMNS.usage!)),
      surveys: sv.map((r) => toRow(r, COLUMNS.surveys!)),
    };
  });


// ---- listIngestBatches ----------------------------------------------------

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface IngestBatchRow {
  id: string;
  source_kind: string;
  source_provider: string;
  dataset_key: string;
  filename: string | null;
  row_count: number;
  status: string;
  error: string | null;
  created_at: string;
  meta: JsonValue;
}

export const listIngestBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IngestBatchRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ingest_batches")
      .select("id, source_kind, source_provider, dataset_key, filename, row_count, status, error, created_at, meta")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown) as IngestBatchRow[];
  });

// ---- deleteIngestBatch ----------------------------------------------------

export const deleteIngestBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => DeleteBatchInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Delete rows belonging to this batch across all dataset tables, then the
    // batch itself. RLS scopes each delete to the caller.
    const tables = [
      "ingested_customers",
      "ingested_transactions",
      "ingested_support",
      "ingested_usage",
      "ingested_surveys",
    ] as const;
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq("user_id", userId).eq("batch_id", data.id);
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase
      .from("ingest_batches")
      .delete()
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
