// Public OAuth callback for Zendesk per-user OAuth.
import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, params: Record<string, string>) {
  const p = new URLSearchParams(params);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/app/data?${p}` },
  });
}

export const Route = createFileRoute("/api/public/zendesk/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) return appRedirect(origin, { zendesk_error: errorParam });
        if (!code || !state) return appRedirect(origin, { zendesk_error: "missing_code_or_state" });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeZendeskCode, saveZendeskConnection } = await import("@/lib/zendesk.server");

          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("zendesk_oauth_states")
            .select("user_id, subdomain, redirect_uri")
            .eq("state", state)
            .maybeSingle();
          if (stateErr) throw new Error(stateErr.message);
          if (!stateRow) return appRedirect(origin, { zendesk_error: "invalid_state" });

          await supabaseAdmin.from("zendesk_oauth_states").delete().eq("state", state);

          const subdomain = stateRow.subdomain as string;
          const tokens = await exchangeZendeskCode(subdomain, code, stateRow.redirect_uri as string);
          await saveZendeskConnection(stateRow.user_id as string, subdomain, tokens);

          return appRedirect(origin, { zendesk_connected: "1" });
        } catch (e) {
          console.error("Zendesk OAuth callback failed:", e);
          return appRedirect(origin, {
            zendesk_error: e instanceof Error ? e.message.slice(0, 140) : "callback_failed",
          });
        }
      },
    },
  },
});
