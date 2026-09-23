// Right-to-be-forgotten erasure for a single customer.
//
// Deletes every stored row that describes the person (customer record,
// transactions, support tickets, activity/usage, survey responses, and any
// saved identity mappings), then pseudonymises their scoring history so
// aggregate trends and counts stay intact — "delete the person, keep the
// insight".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllPages } from "@/lib/ingest-row-normalize";
import {
  erasureKeysFor,
  pseudonymFor,
  isPseudonym,
  type ErasableCustomerRow,
  type ErasureCounts,
} from "@/lib/customer-erasure";

const ForgetInput = z.object({
  identifier: z.string().trim().min(1).max(320),
});

export interface ForgetCustomerResult extends ErasureCounts {
  keys: string[];
}

export const forgetCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ForgetInput.parse(v))
  .handler(async ({ data, context }): Promise<ForgetCustomerResult> => {
    const { supabase, userId } = context;

    // 1. Resolve every stored key for this person (typed id, plus any record
    //    whose name/email matches it).
    const customerRows = (await fetchAllPages(
      (from, to) =>
        supabase
          .from("ingested_customers")
          .select("customer_id, data")
          .eq("user_id", userId)
          .order("id", { ascending: true })
          .range(from, to) as never,
      "ingested_customers",
    )) as unknown as ErasableCustomerRow[];

    const keys = erasureKeysFor(customerRows, data.identifier).filter((k) => !isPseudonym(k));
    if (keys.length === 0) {
      return {
        keys: [],
        customers: 0,
        transactions: 0,
        support: 0,
        usage: 0,
        surveys: 0,
        aliases: 0,
        scoresAnonymised: 0,
      };
    }

    // 2. Delete the personal rows. RLS scopes every delete to the caller.
    const tables = [
      ["ingested_customers", "customers"],
      ["ingested_transactions", "transactions"],
      ["ingested_support", "support"],
      ["ingested_usage", "usage"],
      ["ingested_surveys", "surveys"],
    ] as const;

    const counts: ErasureCounts = {
      customers: 0,
      transactions: 0,
      support: 0,
      usage: 0,
      surveys: 0,
      aliases: 0,
      scoresAnonymised: 0,
    };

    const perBatch: Record<string, number> = {};

    for (const [table, key] of tables) {
      const { data: deleted, error } = await supabase
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
      const { data: batch, error: readError } = await supabase
        .from("ingest_batches")
        .select("row_count")
        .eq("user_id", userId)
        .eq("id", batchId)
        .maybeSingle();
      if (readError) throw new Error(`ingest_batches: ${readError.message}`);
      if (!batch) continue;
      const { error: writeError } = await supabase
        .from("ingest_batches")
        .update({ row_count: remainingRowCount(batch.row_count, removed) })
        .eq("user_id", userId)
        .eq("id", batchId);
      if (writeError) throw new Error(`ingest_batches: ${writeError.message}`);
    }

    // Saved identity mappings point at the person from both directions.
    for (const column of ["customer_id", "source_id"] as const) {
      const { data: deleted, error } = await supabase
        .from("customer_id_aliases")
        .delete()
        .eq("user_id", userId)
        .in(column, keys)
        .select("id");
      if (error) throw new Error(`customer_id_aliases: ${error.message}`);
      counts.aliases += (deleted ?? []).length;
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
  });
