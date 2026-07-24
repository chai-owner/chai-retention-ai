// Client-callable server functions for the Freshdesk API-key integration.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getFreshdeskStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getFreshdeskStatusRow } = await import("./freshdesk.server");
    const row = await getFreshdeskStatusRow(context.userId);
    if (!row) return { connected: false as const };
    return {
      connected: true as const,
      domain: row.domain,
      connectedAt: row.connected_at,
      lastSyncedAt: row.last_synced_at,
    };
  });

export const connectFreshdesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        domain: z.string().min(1).max(100),
        apiKey: z.string().min(8).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveFreshdeskConnection } = await import("./freshdesk.server");
    return await saveFreshdeskConnection(context.userId, data.domain, data.apiKey);
  });

export const disconnectFreshdesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteFreshdeskConnection } = await import("./freshdesk.server");
    await deleteFreshdeskConnection(context.userId);
    return { ok: true };
  });
