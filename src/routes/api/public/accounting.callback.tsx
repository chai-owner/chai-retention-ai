// Public OAuth callback for accounting integrations. The provider redirects
// here after the user authorizes. We look up the pending state (which maps to
// the user), exchange the code for tokens, resolve the org/company, persist the
// connection, then bounce the user back into the app.
//
// This route is public because the provider (not a logged-in browser session)
// calls it, so the user identity comes from the signed state row, not a session.
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
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const realmId = url.searchParams.get("realmId") ?? undefined; // QBO
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return appRedirect(origin, { accounting_error: errorParam });
        }
        if (!code || !state) {
          return appRedirect(origin, { accounting_error: "missing_code_or_state" });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const {
            exchangeCode,
            resolveAccountInfo,
            saveConnection,
          } = await import("@/lib/accounting.server");

          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("accounting_oauth_states")
            .select("user_id, provider, redirect_uri")
            .eq("state", state)
            .maybeSingle();
          if (stateErr) throw new Error(stateErr.message);
          if (!stateRow) {
            return appRedirect(origin, { accounting_error: "invalid_state" });
          }

          // One-time use.
          await supabaseAdmin
            .from("accounting_oauth_states")
            .delete()
            .eq("state", state);

          const provider = stateRow.provider as
            | "quickbooks"
            | "xero"
            | "freshbooks";

          const tokens = await exchangeCode(
            provider,
            code,
            stateRow.redirect_uri,
          );
          const info = await resolveAccountInfo(provider, tokens, realmId);
          await saveConnection(stateRow.user_id, provider, tokens, info);

          return appRedirect(origin, { accounting_connected: provider });
        } catch (e) {
          console.error("Accounting OAuth callback failed:", e);
          return appRedirect(origin, {
            accounting_error:
              e instanceof Error ? e.message.slice(0, 140) : "callback_failed",
          });
        }
      },
    },
  },
});
