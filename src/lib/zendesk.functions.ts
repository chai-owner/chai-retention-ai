// Client-callable server functions for the Zendesk global-OAuth flow.
// The client ID/secret and redirect URI never leave the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getZendeskConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { hasZendeskCreds } = await import("./zendesk.server");
  return { configured: hasZendeskCreds() };
});

export const getZendeskStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getZendeskStatusRow } = await import("./zendesk.server");
    const row = await getZendeskStatusRow(context.userId);
    if (!row) return { connected: false as const };
    return {
      connected: true as const,
      orgName: row.org_name,
      subdomain: row.subdomain,
      connectedAt: row.connected_at,
      lastSyncedAt: row.last_synced_at,
      status: (row.status ?? "connected") as "connected" | "needs_reauth" | "error",
      lastError: row.last_error_message,
      accountEmail: row.zendesk_account_email,
    };
  });

export const startZendeskConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        origin: z.string().url(),
        subdomain: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      getZendeskCreds,
      buildZendeskAuthorizeUrl,
      normalizeSubdomain,
      getZendeskRedirectUri,
      STATE_TTL_MS,
    } = await import("./zendesk.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    getZendeskCreds(); // fail fast with a readable message if unconfigured

    const subdomain = normalizeSubdomain(data.subdomain);
    const redirectUri = getZendeskRedirectUri(data.origin);
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin.from("zendesk_oauth_states").insert({
      state,
      user_id: context.userId, // server-side identity only
      subdomain,
      redirect_uri: redirectUri,
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { url: buildZendeskAuthorizeUrl(subdomain, redirectUri, state) };
  });

export const disconnectZendesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteZendeskConnection } = await import("./zendesk.server");
    await deleteZendeskConnection(context.userId);
    return { ok: true };
  });
