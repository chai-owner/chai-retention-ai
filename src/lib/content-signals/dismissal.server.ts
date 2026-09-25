// Removes a dismissed signal's contribution from the stored score snapshot
// straight away. The caller has already verified the signal belongs to userId.
// customer_scores is read-only for signed-in users, so the write uses the
// privileged client, scoped to that user's own latest rows.
import { removeSignalFromSnapshot } from "./scoring";
import type { CustomerScore } from "@/lib/customer-scoring";

export async function rescoreAfterDismissal(userId: string, signalId: string): Promise<number> {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = await getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("customer_scores")
    .select("id, customer_id, score, score_breakdown")
    .eq("user_id", userId)
    .eq("is_latest", true)
    .contains("score_breakdown", [{ signals: [{ id: signalId }] }] as never);
  if (error) throw new Error(`customer_scores: ${error.message}`);

  let count = 0;
  for (const row of rows ?? []) {
    const next = removeSignalFromSnapshot(
      {
        customer_id: row.customer_id as string,
        score: Number(row.score),
        score_breakdown: (row.score_breakdown ?? []) as unknown as CustomerScore["score_breakdown"],
      },
      signalId,
    );
    const { error: updateError } = await admin
      .from("customer_scores")
      .update({
        score: next.score,
        risk_level: next.risk_level,
        score_breakdown: next.score_breakdown as never,
      })
      .eq("id", row.id as string)
      .eq("user_id", userId);
    if (updateError) throw new Error(`customer_scores: ${updateError.message}`);
    count++;
  }
  return count;
}
