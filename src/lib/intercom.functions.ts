// Client-callable server functions for the Intercom per-user OAuth flow.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getIntercomConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { hasIntercomCreds } = await import("./intercom.server");
  return { configured: hasIntercomCreds() };
});

export const getIntercomStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getIntercomStatusRow } = await import("./intercom.server");
    const row = await getIntercomStatusRow(context.userId);
    if (!row) return { connected: false as const };
    return {
      connected: true as const,
      workspaceName: row.workspace_name,
      workspaceId: row.workspace_id,
      connectedAt: row.connected_at,
      lastSyncedAt: row.last_synced_at,
    };
  });

export const startIntercomConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ origin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getIntercomCreds, buildIntercomAuthorizeUrl } = await import("./intercom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    getIntercomCreds();
    const redirectUri = `${data.origin}/api/public/intercom/callback`;
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin.from("intercom_oauth_states").insert({
      state,
      user_id: context.userId,
      redirect_uri: redirectUri,
    });
    if (error) throw new Error(error.message);
    return { url: buildIntercomAuthorizeUrl(state) };
  });

export const disconnectIntercom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteIntercomConnection } = await import("./intercom.server");
    await deleteIntercomConnection(context.userId);
    return { ok: true };
  });
