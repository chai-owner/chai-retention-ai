// Public OAuth callback for Intercom per-user OAuth.
// State is validated, atomically consumed (single-use) and checked for expiry
// before the authorization code is exchanged server-side.
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
        const {
          consumeOAuthState,
          safeAppOrigin,
          sanitizeOAuthError,
        } = await import("@/lib/oauth-state.server");
        const origin = safeAppOrigin(url.origin);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          console.error("Intercom OAuth error response:", sanitizeOAuthError(errorParam));
          return appRedirect(origin, {
            intercom_error: "Intercom declined the connection. Please try again.",
          });
        }
        if (!code || !state) return appRedirect(origin, { intercom_error: "missing_code_or_state" });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeIntercomCode, saveIntercomConnection } = await import(
            "@/lib/intercom.server"
          );

          const outcome = await consumeOAuthState(supabaseAdmin as never, {
            table: "intercom_oauth_states",
            provider: "intercom",
            state,
          });
          if (!outcome.ok) {
            console.error("Intercom OAuth state rejected:", outcome.reason);
            return appRedirect(origin, {
              intercom_error:
                outcome.reason === "expired_state"
                  ? "This Intercom connection link expired. Please start again."
                  : "This Intercom connection link is no longer valid. Please start again.",
            });
          }

          const row = outcome.row as { user_id: string; redirect_uri: string };
          const tokens = await exchangeIntercomCode(code, row.redirect_uri);
          await saveIntercomConnection(row.user_id, tokens);

          return appRedirect(origin, { intercom_connected: "1" });
        } catch (e) {
          const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
          console.error("Intercom OAuth callback failed:", msg);
          return appRedirect(origin, {
            intercom_error: "We couldn't finish connecting Intercom. Please try again.",
          });
        }
      },
    },
  },
});
