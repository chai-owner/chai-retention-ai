// Client-callable server functions for the Zendesk per-user OAuth flow.
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
    };
  });

export const startZendeskConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        origin: z.string().url(),
        subdomain: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/i),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getZendeskCreds, buildZendeskAuthorizeUrl } = await import("./zendesk.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    getZendeskCreds(); // ensure env vars are present
    const redirectUri = `${data.origin}/api/public/zendesk/callback`;
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin.from("zendesk_oauth_states").insert({
      state,
      user_id: context.userId,
      subdomain: data.subdomain,
      redirect_uri: redirectUri,
    });
    if (error) throw new Error(error.message);
    return { url: buildZendeskAuthorizeUrl(data.subdomain, redirectUri, state) };
  });

export const disconnectZendesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteZendeskConnection } = await import("./zendesk.server");
    await deleteZendeskConnection(context.userId);
    return { ok: true };
  });
