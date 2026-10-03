// Ported verbatim from src/lib/support.server.ts.
import type { ExtractedDataset } from "./types.ts";
import { getSupabaseAdmin } from "./client.ts";

export type SupportProvider = "zendesk" | "intercom" | "freshdesk";

export async function markSupportSynced(userId: string, provider: SupportProvider, when: string): Promise<void> {
  const supabaseAdmin = await getSupabaseAdmin();
  await supabaseAdmin.from("support_sync_state").upsert({ user_id: userId, provider, last_synced_at: when }, { onConflict: "user_id,provider" });
  if (provider === "zendesk") {
    await supabaseAdmin.from("zendesk_connections").update({ last_synced_at: when }).eq("user_id", userId);
  } else if (provider === "intercom") {
    await supabaseAdmin.from("intercom_connections").update({ last_synced_at: when }).eq("user_id", userId);
  } else if (provider === "freshdesk") {
    await supabaseAdmin.from("freshdesk_connections").update({ last_synced_at: when }).eq("user_id", userId);
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
    const { syncZendeskForUser } = await import("./zendesk.ts");
    datasets = await syncZendeskForUser(userId, limit, since);
  } else if (provider === "intercom") {
    const { syncIntercomForUser } = await import("./intercom.ts");
    datasets = await syncIntercomForUser(userId, limit, since);
  } else if (provider === "freshdesk") {
    const { syncFreshdeskForUser } = await import("./freshdesk.ts");
    datasets = await syncFreshdeskForUser(userId, limit, since);
  } else {
    throw new Error("Unsupported support provider");
  }
  const rows = datasets.reduce((a, d) => a + d.rows.length, 0);
  return { datasets, rows };
}
