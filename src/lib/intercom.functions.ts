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
    const { createOAuthState, resolveRedirectUri } = await import("./oauth-state.server");
    getIntercomCreds();
    const redirectUri = resolveRedirectUri(
      "INTERCOM_REDIRECT_URI",
      "/api/public/intercom/callback",
      data.origin,
    );
    const state = await createOAuthState(supabaseAdmin as never, {
      table: "intercom_oauth_states",
      userId: context.userId,
      provider: "intercom",
      redirectUri,
    });
    return { url: buildIntercomAuthorizeUrl(state, redirectUri) };
  });


export const disconnectIntercom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteIntercomConnection } = await import("./intercom.server");
    await deleteIntercomConnection(context.userId);
    return { ok: true };
  });
