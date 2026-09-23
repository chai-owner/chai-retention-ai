// The actual erasure work for "Forget a customer", split out from the server
// function so it can be run (and verified) against a real database with an
// explicit client rather than only through an authenticated request.
//
// `db` is always scoped to one workspace by the caller: the server function
// passes the caller's RLS-scoped client, and every statement below also filters
// on `user_id` explicitly.
import { fetchAllPages } from "@/lib/ingest-row-normalize";
import {
  erasureKeysFor,
  pseudonymFor,
  isPseudonym,
  tallyBatchDeletions,
  remainingRowCount,
  type ErasableCustomerRow,
  type ErasureCounts,
} from "@/lib/customer-erasure";

export interface ForgetCustomerResult extends ErasureCounts {
  keys: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function eraseCustomerData(
  db: Db,
  userId: string,
  identifier: string,
): Promise<ForgetCustomerResult> {
  // 1. Resolve every stored key for this person (typed id, plus any record
  //    whose name/email matches it).
  const customerRows = (await fetchAllPages(
    (from, to) =>
      db
        .from("ingested_customers")
        .select("customer_id, data")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to) as never,
    "ingested_customers",
  )) as unknown as ErasableCustomerRow[];

  const keys = erasureKeysFor(customerRows, identifier).filter((k) => !isPseudonym(k));

  const counts: ErasureCounts = {
    customers: 0,
    transactions: 0,
    support: 0,
    usage: 0,
    surveys: 0,
    aliases: 0,
    content: 0,
    scoresAnonymised: 0,
  };

  if (keys.length === 0) return { ...counts, keys: [] };

  // 2. Delete the personal rows.
  const tables = [
    ["ingested_customers", "customers"],
    ["ingested_transactions", "transactions"],
    ["ingested_support", "support"],
    ["ingested_usage", "usage"],
    ["ingested_surveys", "surveys"],
  ] as const;

  const perBatch: Record<string, number> = {};

  for (const [table, key] of tables) {
    const { data: deleted, error } = await db
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("customer_id", keys)
      .select("id, batch_id");
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[key] = (deleted ?? []).length;
    tallyBatchDeletions((deleted ?? []) as { batch_id?: string | null }[], perBatch);
  }

  // Upload history counts how many rows each file contributed; bring those
  // down so they don't keep advertising rows that no longer exist.
  for (const [batchId, removed] of Object.entries(perBatch)) {
    const { data: batch, error: readError } = await db
      .from("ingest_batches")
      .select("row_count")
      .eq("user_id", userId)
      .eq("id", batchId)
      .maybeSingle();
    if (readError) throw new Error(`ingest_batches: ${readError.message}`);
    if (!batch) continue;
    const { error: writeError } = await db
      .from("ingest_batches")
      .update({ row_count: remainingRowCount(batch.row_count, removed) })
      .eq("user_id", userId)
      .eq("id", batchId);
    if (writeError) throw new Error(`ingest_batches: ${writeError.message}`);
  }

  // Saved identity mappings point at the person from both directions.
  for (const column of ["customer_id", "source_id"] as const) {
    const { data: deleted, error } = await db
      .from("customer_id_aliases")
      .delete()
      .eq("user_id", userId)
      .in(column, keys)
      .select("id");
    if (error) throw new Error(`customer_id_aliases: ${error.message}`);
    counts.aliases += (deleted ?? []).length;
  }

  // Conversation text and the signals read out of it are content about the
  // person too — every source's content store is swept by customer reference,
  // whichever connector it arrived from.
  for (const table of ["content_risk_signals", "content_conversations"] as const) {
    const { data: deleted, error } = await db
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("customer_ref", keys)
      .select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    counts.content += (deleted ?? []).length;
  }

  // 3. Pseudonymise the scoring history instead of deleting it, so risk
  //    trends and historical counts are unchanged by the erasure.
  //    customer_scores is insert/update-protected from the user role, so this
  //    runs with the service client after the caller has been authenticated
  //    and every key above was resolved from their own workspace.
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = await getSupabaseAdmin();
  for (const key of keys) {
    const replacement = await pseudonymFor(userId, key);
    const { data: updated, error } = await admin
      .from("customer_scores")
      .update({ customer_id: replacement })
      .eq("user_id", userId)
      .eq("customer_id", key)
      .select("id");
    if (error) throw new Error(`customer_scores: ${error.message}`);
    counts.scoresAnonymised += (updated ?? []).length;
  }

  return { ...counts, keys };
}
