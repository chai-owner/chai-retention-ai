// Server-only helpers for support-tool syncs (Zendesk). Used by both the
// manual "Sync now" button in the UI and the daily cron hook.
import type { ExtractedDataset } from "./ingest.functions";

export type SupportProvider = "zendesk";

export async function getSupportSince(
  userId: string,
  provider: SupportProvider,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("support_sync_state")
    .select("last_synced_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data?.last_synced_at as string | null) ?? null;
}

export async function markSupportSynced(
  userId: string,
  provider: SupportProvider,
  when: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("support_sync_state").upsert(
    { user_id: userId, provider, last_synced_at: when },
    { onConflict: "user_id,provider" },
  );
}

export async function runSupportSync(
  provider: SupportProvider,
  userId: string,
  limit: number,
  since: string | null,
): Promise<{ datasets: ExtractedDataset[]; rows: number }> {
  if (provider !== "zendesk") throw new Error("Unsupported support provider");
  const { syncZendeskForUser } = await import("./zendesk.server");
  const datasets = await syncZendeskForUser(userId, limit, since);
  const rows = datasets.reduce((a, d) => a + d.rows.length, 0);
  return { datasets, rows };
}
