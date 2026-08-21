// Public OAuth callback for accounting integrations (QuickBooks, Xero,
// FreshBooks). The provider redirects here after the user authorizes.
//
// The user identity comes exclusively from the server-side state row, which is
// validated, expiry-checked and atomically consumed exactly once before the
// authorization code is exchanged. Nothing browser-supplied determines
// ownership of the resulting connection.
import { createFileRoute } from "@tanstack/react-router";

function appRedirect(origin: string, params: Record<string, string>) {
  const p = new URLSearchParams(params);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/app/data?${p}` },
  });
}

export const Route = createFileRoute("/api/public/accounting/callback")({
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
        const realmId = url.searchParams.get("realmId") ?? undefined; // QBO
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          console.error("Accounting OAuth error response:", sanitizeOAuthError(errorParam));
          return appRedirect(origin, {
            accounting_error: "The provider declined the connection. Please try again.",
          });
        }
        if (!code || !state) {
          return appRedirect(origin, { accounting_error: "missing_code_or_state" });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeCode, resolveAccountInfo, saveConnection } = await import(
            "@/lib/accounting.server"
          );

          // The provider is recovered from the state row itself, so a state
          // issued for one provider can never be replayed against another.
          const outcome = await consumeOAuthState(supabaseAdmin as never, {
            table: "accounting_oauth_states",
            provider: null,
            state,
          });
          if (!outcome.ok) {
            console.error("Accounting OAuth state rejected:", outcome.reason);
            return appRedirect(origin, {
              accounting_error:
                outcome.reason === "expired_state"
                  ? "This connection link expired. Please start again."
                  : "This connection link is no longer valid. Please start again.",
            });
          }

          const row = outcome.row as {
            user_id: string;
            provider: "quickbooks" | "xero" | "freshbooks";
            redirect_uri: string;
          };

          const tokens = await exchangeCode(row.provider, code, row.redirect_uri);
          const info = await resolveAccountInfo(row.provider, tokens, realmId);
          await saveConnection(row.user_id, row.provider, tokens, info);

          return appRedirect(origin, { accounting_connected: row.provider });
        } catch (e) {
          const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
          console.error("Accounting OAuth callback failed:", msg);
          return appRedirect(origin, {
            accounting_error: "We couldn't finish connecting that account. Please try again.",
          });
        }
      },
    },
  },
});
