// Trimmed port of src/lib/crm.server.ts: Zoho CRM only. Salesforce and
// HubSpot are intentionally NOT ported here — both go through Lovable's own
// "App User Connector" gateway (connector-gateway.lovable.dev), which is
// Lovable platform infrastructure, not something this app owns credentials
// for. There are currently zero Salesforce/HubSpot connections on this
// project (connector/OAuth tables were excluded from the data migration by
// design), so this is a forward-looking gap, not a regression for any
// existing customer. See migration-status.md for the follow-up decision.
import type { ExtractedDataset } from "./types.ts";
import { getSupabaseAdmin } from "./client.ts";

export type CrmProvider = "salesforce" | "hubspot" | "zoho_crm";

async function admin() {
  return getSupabaseAdmin();
}

export async function markCrmSynced(userId: string, provider: CrmProvider, when: string): Promise<void> {
  const db = await admin();
  await db.from("crm_sync_state").upsert({ user_id: userId, provider, last_synced_at: when }, { onConflict: "user_id,provider" });
}

export async function runCrmSync(provider: CrmProvider, userId: string, limit: number, since: string | null): Promise<ExtractedDataset[]> {
  if (provider === "zoho_crm") {
    const { syncZohoForUser } = await import("./zoho.ts");
    return syncZohoForUser(userId, limit, since);
  }
  throw new Error(
    `${provider} sync is not available yet on this project: it depended on Lovable's connector gateway, which isn't part of this migration. Skipping.`,
  );
}
