// Public OAuth callback for the ChAi global Zendesk OAuth client.
// Validates state (existence, expiry, single-use), exchanges the code
// server-side, verifies the connection, then stores encrypted tokens.
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

        const {
          humanZendeskError,
          logZendeskDiagnostic,
          exchangeZendeskCode,
          saveZendeskConnection,
          verifyZendeskConnection,
          STATE_TTL_MS,
        } = await import("@/lib/zendesk.server");

        if (errorParam) {
          logZendeskDiagnostic({ stage: "authorize_redirect", subdomain: "unknown", errorCode: errorParam });
          return appRedirect(origin, {
            zendesk_error: humanZendeskError(400, errorParam, "unknown"),
          });
        }
        if (!code || !state) {
          return appRedirect(origin, {
            zendesk_error: "Zendesk didn't return a valid authorization response. Please try connecting again.",
          });
        }

        let subdomain = "unknown";
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("zendesk_oauth_states")
            .select("user_id, subdomain, redirect_uri, created_at, expires_at")
            .eq("state", state)
            .maybeSingle();
          if (stateErr) throw new Error(stateErr.message);
          if (!stateRow) {
            logZendeskDiagnostic({ stage: "state_validation", subdomain, errorCode: "invalid_or_reused_state" });
            return appRedirect(origin, {
              zendesk_error: "This Zendesk connection link is no longer valid. Please start the connection again.",
            });
          }

          // Single-use: burn the state before doing anything else.
          await supabaseAdmin.from("zendesk_oauth_states").delete().eq("state", state);

          const expiresAt = (stateRow as { expires_at?: string | null }).expires_at;
          const deadline = expiresAt
            ? new Date(expiresAt).getTime()
            : new Date(stateRow.created_at as string).getTime() + STATE_TTL_MS;
          if (Date.now() > deadline) {
            logZendeskDiagnostic({ stage: "state_validation", subdomain, errorCode: "expired_state" });
            return appRedirect(origin, {
              zendesk_error: "The Zendesk authorization request expired. Please try connecting again.",
            });
          }

          subdomain = stateRow.subdomain as string;
          const tokens = await exchangeZendeskCode(subdomain, code, stateRow.redirect_uri as string);

          // Prove the token really works before showing "Connected".
          const account = await verifyZendeskConnection(subdomain, tokens.accessToken);

          await saveZendeskConnection(stateRow.user_id as string, subdomain, tokens, account);

          return appRedirect(origin, { zendesk_connected: subdomain });
        } catch (e) {
          logZendeskDiagnostic({
            stage: "callback",
            subdomain,
            detail: e instanceof Error ? e.message : "unknown failure",
          });
          return appRedirect(origin, {
            zendesk_error:
              e instanceof Error
                ? e.message.slice(0, 180)
                : "ChAi could not connect to this Zendesk account. Please verify the Zendesk subdomain and try again.",
          });
        }
      },
    },
  },
});
