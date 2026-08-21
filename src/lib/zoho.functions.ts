// Client-callable server functions for the Zoho CRM per-user OAuth flow.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getZohoConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { hasZohoCreds } = await import("./zoho.server");
  return { configured: hasZohoCreds() };
});

export const getZohoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getZohoStatusRow } = await import("./zoho.server");
    const row = await getZohoStatusRow(context.userId);
    if (!row) return { connected: false as const };
    return { connected: true as const, orgName: row.org_name, connectedAt: row.connected_at };
  });

export const startZohoConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      origin: z.string().url(),
      dc: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getZohoCreds, buildZohoAuthorizeUrl } = await import("./zoho.server");
    const { defaultDc } = getZohoCreds();
    const dc = data.dc || defaultDc;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createOAuthState, resolveRedirectUri } = await import("./oauth-state.server");
    const redirectUri = resolveRedirectUri(
      "ZOHO_REDIRECT_URI",
      "/api/public/zoho/callback",
      data.origin,
    );
    const state = await createOAuthState(supabaseAdmin as never, {
      table: "zoho_crm_oauth_states",
      userId: context.userId,
      provider: "zoho_crm",
      redirectUri,
      extra: { dc },
    });
    return { url: buildZohoAuthorizeUrl(dc, redirectUri, state) };
  });


export const disconnectZoho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { revokeZohoRefreshToken } = await import("./zoho.server");
    const { data } = await supabaseAdmin
      .from("zoho_crm_connections")
      .select("dc, refresh_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (data?.refresh_token) {
      await revokeZohoRefreshToken(data.dc as string, data.refresh_token as string);
    }
    const { error } = await supabaseAdmin
      .from("zoho_crm_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
