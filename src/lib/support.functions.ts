// Client-callable server functions for support-tool syncs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SyncInput = z.object({
  provider: z.enum(["zendesk"]),
  limit: z.number().int().min(1).max(1000).optional().default(200),
});

export interface SupportSyncResult {
  provider: "zendesk";
  providerName: string;
  rows: number;
  since: string | null;
}

export const syncZendesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data, context }): Promise<SupportSyncResult> => {
    const { runSupportSync, getSupportSince, markSupportSynced } = await import("./support.server");
    const { persistDatasetsAdmin } = await import("./sync-persist.server");
    const provider = data.provider;
    const since = await getSupportSince(context.userId, provider);
    const startedAt = new Date().toISOString();
    const { datasets, rows } = await runSupportSync(provider, context.userId, data.limit, since);
    if (rows > 0) {
      await persistDatasetsAdmin(context.userId, "support", provider, datasets);
    }
    await markSupportSynced(context.userId, provider, startedAt);
    return { provider, providerName: "Zendesk", rows, since };
  });
