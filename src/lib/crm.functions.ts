// Client-callable wrappers around the CRM sync core in `crm.server.ts`.
// This file is client-safe: only the RPC boundary lives here, real
// implementations are behind `await import(...)` inside handler bodies.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedDataset } from "./ingest.functions";

export type CrmProvider = "salesforce" | "hubspot" | "zoho_crm";

export const CRM_PROVIDERS: { id: CrmProvider; name: string; keyEnv: string }[] = [
  { id: "salesforce", name: "Salesforce", keyEnv: "SALESFORCE_API_KEY" },
  { id: "hubspot", name: "HubSpot", keyEnv: "HUBSPOT_API_KEY" },
  { id: "zoho_crm", name: "Zoho CRM", keyEnv: "ZOHO_CRM_API_KEY" },
];

export interface CrmSyncResult {
  provider: CrmProvider;
  providerName: string;
  datasets: ExtractedDataset[];
  since: string | null;
}

const SyncInput = z.object({
  provider: z.enum(["salesforce", "hubspot", "zoho_crm"]),
  limit: z.number().int().min(1).max(500).optional().default(200),
});

export const syncCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data, context }): Promise<CrmSyncResult> => {
    const provider = data.provider as CrmProvider;
    const name = CRM_PROVIDERS.find((p) => p.id === provider)!.name;
    const { runCrmSync, getCrmSince, markCrmSynced } = await import("./crm.server");

    const since = await getCrmSince(context.userId, provider);
    const startedAt = new Date().toISOString();
    const datasets = await runCrmSync(provider, data.limit, since);
    await markCrmSynced(context.userId, provider, startedAt);
    return { provider, providerName: name, datasets, since };
  });
