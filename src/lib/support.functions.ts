// Client-callable server functions for support-tool syncs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SyncInput = z.object({
  provider: z.enum(["zendesk", "intercom", "freshdesk"]),
  limit: z.number().int().min(1).max(1000).optional().default(200),
});

export type SupportProvider = "zendesk" | "intercom" | "freshdesk";

export interface SupportSyncResult {
  provider: SupportProvider;
  providerName: string;
  rows: number;
  since: string | null;
}

const PROVIDER_NAME: Record<SupportProvider, string> = {
  zendesk: "Zendesk",
  intercom: "Intercom",
  freshdesk: "Freshdesk",
};

async function runSync(provider: SupportProvider, userId: string, limit: number) {
  const { runSupportSync, getSupportSince, markSupportSynced, warmSupportEnv } = await import(
    "./support.server"
  );
  await warmSupportEnv();
  const { persistDatasetsAdmin } = await import("./sync-persist.server");
  const since = await getSupportSince(userId, provider);
  const startedAt = new Date().toISOString();
  const { datasets, rows } = await runSupportSync(provider, userId, limit, since);
  if (rows > 0) {
    await persistDatasetsAdmin(userId, "support", provider, datasets);
  }
  await markSupportSynced(userId, provider, startedAt);
  return { since, rows };
}

export const syncZendesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data, context }): Promise<SupportSyncResult> => {
    try {
      const { since, rows } = await runSync(data.provider, context.userId, data.limit);
      return { provider: data.provider, providerName: PROVIDER_NAME[data.provider], rows, since };
    } catch (error) {
      // Never swallow: log the real failure and re-throw it verbatim so the UI
      // can show what actually went wrong.
      console.error("[syncSupport] failed", {
        userId: context.userId,
        provider: data.provider,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join("\n") : undefined,
      });
      throw error;
    }
  });

// Generic name so the UI can call the same fn for any support provider.
export const syncSupport = syncZendesk;
