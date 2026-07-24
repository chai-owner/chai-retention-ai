// Public OAuth callback for Intercom per-user OAuth.
import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, params: Record<string, string>) {
  const p = new URLSearchParams(params);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/app/data?${p}` },
  });
}

export const Route = createFileRoute("/api/public/intercom/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) return appRedirect(origin, { intercom_error: errorParam });
        if (!code || !state) return appRedirect(origin, { intercom_error: "missing_code_or_state" });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeIntercomCode, saveIntercomConnection } = await import(
            "@/lib/intercom.server"
          );

          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("intercom_oauth_states")
            .select("user_id, redirect_uri")
            .eq("state", state)
            .maybeSingle();
          if (stateErr) throw new Error(stateErr.message);
          if (!stateRow) return appRedirect(origin, { intercom_error: "invalid_state" });

          await supabaseAdmin.from("intercom_oauth_states").delete().eq("state", state);

          const tokens = await exchangeIntercomCode(code);
          await saveIntercomConnection(stateRow.user_id as string, tokens);

          return appRedirect(origin, { intercom_connected: "1" });
        } catch (e) {
          console.error("Intercom OAuth callback failed:", e);
          return appRedirect(origin, {
            intercom_error: e instanceof Error ? e.message.slice(0, 140) : "callback_failed",
          });
        }
      },
    },
  },
});
