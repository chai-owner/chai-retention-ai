// Admin-only read: how much REAL support conversation volume exists, used to
// decide when Phase 0 can be re-validated against real data rather than the
// constructed test examples.
import { createServerFn } from "@tanstack/react-start";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import { summariseReadiness, type AccountSupportVolume, type ReadinessSummary } from "./readiness";

export const getRealDataReadiness = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<ReadinessSummary> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin access required");

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Only conversations that arrived from a connected support integration
    // count — manual CSV uploads carry no conversation text.
    const { data: batches } = await admin
      .from("ingest_batches")
      .select("id, user_id")
      .eq("source_kind", "support");
    const batchIds = (batches ?? []).map((b) => b.id as string);
    if (batchIds.length === 0) return summariseReadiness([]);

    const { data: rows } = await admin
      .from("ingested_support")
      .select("user_id, batch_id")
      .in("batch_id", batchIds);

    const byUser = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row.user_id as string;
      byUser.set(id, (byUser.get(id) ?? 0) + 1);
    }
    if (byUser.size === 0) return summariseReadiness([]);

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, company")
      .in("id", [...byUser.keys()]);
    const labels = new Map(
      (profiles ?? []).map((p) => [p.id as string, (p.company as string) || (p.email as string) || (p.id as string)]),
    );

    const accounts: AccountSupportVolume[] = [...byUser.entries()].map(([userId, count]) => ({
      userId,
      label: labels.get(userId) ?? userId,
      connectedConversations: count,
    }));
    return summariseReadiness(accounts);
  });
