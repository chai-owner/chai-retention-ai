// Public OAuth callback for Zoho CRM per-user OAuth.
import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, params: Record<string, string>) {
  const p = new URLSearchParams(params);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/app/data?${p}` },
  });
}

export const Route = createFileRoute("/api/public/zoho/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) return appRedirect(origin, { zoho_error: errorParam });
        if (!code || !state) return appRedirect(origin, { zoho_error: "missing_code_or_state" });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeZohoCode, saveZohoConnection, resolveOrgName } = await import("@/lib/zoho.server");

          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("zoho_crm_oauth_states")
            .select("user_id, dc, redirect_uri")
            .eq("state", state)
            .maybeSingle();
          if (stateErr) throw new Error(stateErr.message);
          if (!stateRow) return appRedirect(origin, { zoho_error: "invalid_state" });

          await supabaseAdmin.from("zoho_crm_oauth_states").delete().eq("state", state);

          const dc = stateRow.dc as string;
          const tokens = await exchangeZohoCode(dc, code, stateRow.redirect_uri as string);
          const orgName = await resolveOrgName(tokens.apiDomain, tokens.accessToken);
          await saveZohoConnection(stateRow.user_id as string, dc, tokens, orgName);

          return appRedirect(origin, { zoho_connected: "1" });
        } catch (e) {
          console.error("Zoho OAuth callback failed:", e);
          return appRedirect(origin, {
            zoho_error: e instanceof Error ? e.message.slice(0, 140) : "callback_failed",
          });
        }
      },
    },
  },
});
