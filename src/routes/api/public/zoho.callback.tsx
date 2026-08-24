// Public OAuth callback for Zoho CRM per-user OAuth.
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

export const Route = createFileRoute("/api/public/zoho/callback")({
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
          console.error("Zoho OAuth error response:", sanitizeOAuthError(errorParam));
          return appRedirect(origin, { zoho_error: "Zoho declined the connection. Please try again." });
        }
        if (!code || !state) return appRedirect(origin, { zoho_error: "missing_code_or_state" });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { exchangeZohoCode, saveZohoConnection, resolveOrgName } = await import("@/lib/zoho.server");

          const outcome = await consumeOAuthState(supabaseAdmin as never, {
            table: "zoho_crm_oauth_states",
            provider: "zoho_crm",
            state,
          });
          if (!outcome.ok) {
            console.error("Zoho OAuth state rejected:", outcome.reason);
            return appRedirect(origin, {
              zoho_error:
                outcome.reason === "expired_state"
                  ? "This Zoho connection link expired. Please start again."
                  : "This Zoho connection link is no longer valid. Please start again.",
            });
          }

          const row = outcome.row as { user_id: string; dc: string; redirect_uri: string };

          // Zoho tells us which data center the *user's* account lives in.
          // Both values are untrusted query params, so they are validated
          // against a strict allowlist before use; otherwise we fall back to
          // the data center bound to the OAuth state (existing EU behaviour).
          const { resolveCallbackDataCenter } = await import("@/lib/zoho.server");
          const rawAccountsServer = url.searchParams.get("accounts-server");
          const location = url.searchParams.get("location");
          const { dc, accountsServer } = resolveCallbackDataCenter({
            accountsServer: rawAccountsServer,
            location,
            storedDc: row.dc,
          });
          if (rawAccountsServer && accountsServer !== rawAccountsServer.replace(/\/+$/, "")) {
            console.error(
              `Zoho returned an unsupported accounts-server; using ${accountsServer} for dc=${dc}`,
            );
          }

          const tokens = await exchangeZohoCode({
            accountsServer,
            dc,
            code,
            redirectUri: row.redirect_uri,
          });
          const orgName = await resolveOrgName(tokens.apiDomain, tokens.accessToken);
          await saveZohoConnection(row.user_id, dc, tokens, orgName, accountsServer);

          return appRedirect(origin, { zoho_connected: "1" });
        } catch (e) {
          const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
          console.error("Zoho OAuth callback failed:", msg);
          return appRedirect(origin, {
            zoho_error: "We couldn't finish connecting Zoho CRM. Please try again.",
          });
        }
      },
    },
  },
});
