// Server-only helpers for support-tool syncs (Zendesk, Intercom). Used by both
// the manual "Sync now" button in the UI and the daily cron hook.
import type { ExtractedDataset } from "./ingest.functions";

export type SupportProvider = "zendesk" | "intercom" | "freshdesk";

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
  // Also stamp the connection table so the UI can show "last synced".
  if (provider === "zendesk") {
    await supabaseAdmin
      .from("zendesk_connections")
      .update({ last_synced_at: when })
      .eq("user_id", userId);
  } else if (provider === "intercom") {
    await supabaseAdmin
      .from("intercom_connections")
      .update({ last_synced_at: when })
      .eq("user_id", userId);
  } else if (provider === "freshdesk") {
    await supabaseAdmin
      .from("freshdesk_connections")
      .update({ last_synced_at: when })
      .eq("user_id", userId);
  }
}

export async function runSupportSync(
  provider: SupportProvider,
  userId: string,
  limit: number,
  since: string | null,
): Promise<{ datasets: ExtractedDataset[]; rows: number }> {
  let datasets: ExtractedDataset[];
  if (provider === "zendesk") {
    const { syncZendeskForUser } = await import("./zendesk.server");
    datasets = await syncZendeskForUser(userId, limit, since);
  } else if (provider === "intercom") {
    const { syncIntercomForUser } = await import("./intercom.server");
    datasets = await syncIntercomForUser(userId, limit, since);
  } else if (provider === "freshdesk") {
    const { syncFreshdeskForUser } = await import("./freshdesk.server");
    datasets = await syncFreshdeskForUser(userId, limit, since);
  } else {
    throw new Error("Unsupported support provider");
  }
  const rows = datasets.reduce((a, d) => a + d.rows.length, 0);
  return { datasets, rows };
}

// Seeds sync state at connect time so the daily cron discovers the integration
// even if the user never presses "Sync now". null last_synced_at = full pull.
export async function ensureSupportSyncState(
  userId: string,
  provider: SupportProvider,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("support_sync_state")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (data) return;
  const { error } = await supabaseAdmin
    .from("support_sync_state")
    .insert({ user_id: userId, provider, last_synced_at: null });
  if (error) console.error(`Failed to seed support_sync_state for ${provider}: ${error.message}`);
}

export async function clearSupportSyncState(
  userId: string,
  provider: SupportProvider,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("support_sync_state")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) console.error(`Failed to clear support_sync_state for ${provider}: ${error.message}`);
}
