// Public OAuth callback for all six connectors. The provider redirects the
// user's browser here after they authorize (or decline) the connection, at
// a URL like /functions/v1/oauth-callback/<provider>, where <provider> is
// "accounting" (shared by QuickBooks/Xero/FreshBooks, matching the app's
// existing single-callback design — the specific provider comes from the
// state row), "zendesk", "intercom", or "zoho".
//
// This function must be deployed with --no-verify-jwt: the browser arrives
// here via a plain top-level navigation from the provider, with no
// Authorization header at all. Ownership of the resulting connection comes
// exclusively from the server-side state row (validated, expiry-checked and
// atomically consumed exactly once before the code is exchanged) — nothing
// browser-supplied determines whose account gets connected.
import { getSupabaseAdmin } from "../_shared/client.ts";
import { consumeOAuthState, sanitizeOAuthError } from "../_shared/oauth-state.ts";
import * as accounting from "../_shared/accounting.ts";
import * as zendesk from "../_shared/zendesk.ts";
import * as intercom from "../_shared/intercom.ts";
import * as zoho from "../_shared/zoho.ts";

const APP_ORIGIN = "https://app.askchai.tech";

function appRedirect(params: Record<string, string>): Response {
  const p = new URLSearchParams(params);
  return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN}/app/data?${p}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405 });

  // Path is /functions/v1/oauth-callback/<provider> (or /oauth-callback/<provider>
  // when routed without the /functions/v1 prefix) — take the last segment.
  const segments = url.pathname.split("/").filter(Boolean);
  const provider = segments[segments.length - 1] ?? "";

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const db = await getSupabaseAdmin();

  if (provider === "accounting") {
    if (errorParam) {
      console.error("Accounting OAuth error response:", sanitizeOAuthError(errorParam));
      return appRedirect({ accounting_error: "The provider declined the connection. Please try again." });
    }
    if (!code || !state) return appRedirect({ accounting_error: "missing_code_or_state" });
    try {
      const outcome = await consumeOAuthState(db, { table: "accounting_oauth_states", provider: null, state });
      if (!outcome.ok) {
        return appRedirect({
          accounting_error: outcome.reason === "expired_state"
            ? "This connection link expired. Please start again."
            : "This connection link is no longer valid. Please start again.",
        });
      }
      const row = outcome.row as { user_id: string; provider: "quickbooks" | "xero" | "freshbooks"; redirect_uri: string };
      const realmId = url.searchParams.get("realmId") ?? undefined; // QuickBooks
      const tokens = await accounting.exchangeCode(row.provider, code, row.redirect_uri);
      const info = await accounting.resolveAccountInfo(row.provider, tokens, realmId);
      await accounting.saveConnection(row.user_id, row.provider, tokens, info);
      return appRedirect({ accounting_connected: row.provider });
    } catch (e) {
      const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
      console.error("Accounting OAuth callback failed:", msg);
      return appRedirect({ accounting_error: "We couldn't finish connecting that account. Please try again." });
    }
  }

  if (provider === "zendesk") {
    if (errorParam) {
      console.error("Zendesk OAuth error response:", errorParam);
      return appRedirect({ zendesk_error: "Zendesk connection was cancelled or declined. Please try again." });
    }
    if (!code || !state) {
      return appRedirect({ zendesk_error: "Zendesk didn't return a valid authorization response. Please try connecting again." });
    }
    try {
      const { data: stateRow, error: stateErr } = await db
        .from("zendesk_oauth_states")
        .select("user_id, subdomain, redirect_uri, created_at, expires_at")
        .eq("state", state)
        .maybeSingle();
      if (stateErr) throw new Error(stateErr.message);
      if (!stateRow) {
        return appRedirect({ zendesk_error: "This Zendesk connection link is no longer valid. Please start the connection again." });
      }
      // Single-use: burn the state before doing anything else.
      await db.from("zendesk_oauth_states").delete().eq("state", state);

      const expiresAt = (stateRow as { expires_at?: string | null }).expires_at;
      const deadline = expiresAt
        ? new Date(expiresAt).getTime()
        : new Date(stateRow.created_at as string).getTime() + zendesk.ZENDESK_STATE_TTL_MS;
      if (Date.now() > deadline) {
        return appRedirect({ zendesk_error: "The Zendesk authorization request expired. Please try connecting again." });
      }

      const subdomain = stateRow.subdomain as string;
      const tokens = await zendesk.exchangeZendeskCode(subdomain, code, stateRow.redirect_uri as string);
      const account = await zendesk.verifyZendeskConnection(subdomain, tokens.accessToken);
      await zendesk.saveZendeskConnection(stateRow.user_id as string, subdomain, tokens, account);
      return appRedirect({ zendesk_connected: subdomain });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 180) : "ChAi could not connect to this Zendesk account. Please verify the Zendesk subdomain and try again.";
      console.error("Zendesk OAuth callback failed:", msg);
      return appRedirect({ zendesk_error: msg });
    }
  }

  if (provider === "intercom") {
    if (errorParam) {
      console.error("Intercom OAuth error response:", sanitizeOAuthError(errorParam));
      return appRedirect({ intercom_error: "Intercom declined the connection. Please try again." });
    }
    if (!code || !state) return appRedirect({ intercom_error: "missing_code_or_state" });
    try {
      const outcome = await consumeOAuthState(db, { table: "intercom_oauth_states", provider: "intercom", state });
      if (!outcome.ok) {
        return appRedirect({
          intercom_error: outcome.reason === "expired_state"
            ? "This Intercom connection link expired. Please start again."
            : "This Intercom connection link is no longer valid. Please start again.",
        });
      }
      const row = outcome.row as { user_id: string; redirect_uri: string };
      const tokens = await intercom.exchangeIntercomCode(code, row.redirect_uri);
      await intercom.saveIntercomConnection(row.user_id, tokens);
      return appRedirect({ intercom_connected: "1" });
    } catch (e) {
      const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
      console.error("Intercom OAuth callback failed:", msg);
      return appRedirect({ intercom_error: "We couldn't finish connecting Intercom. Please try again." });
    }
  }

  if (provider === "zoho") {
    if (errorParam) {
      console.error("Zoho OAuth error response:", sanitizeOAuthError(errorParam));
      return appRedirect({ zoho_error: "Zoho declined the connection. Please try again." });
    }
    if (!code || !state) return appRedirect({ zoho_error: "missing_code_or_state" });
    try {
      const outcome = await consumeOAuthState(db, { table: "zoho_crm_oauth_states", provider: "zoho_crm", state });
      if (!outcome.ok) {
        return appRedirect({
          zoho_error: outcome.reason === "expired_state"
            ? "This Zoho connection link expired. Please start again."
            : "This Zoho connection link is no longer valid. Please start again.",
        });
      }
      const row = outcome.row as { user_id: string; dc: string; redirect_uri: string };
      const rawAccountsServer = url.searchParams.get("accounts-server");
      const location = url.searchParams.get("location");
      const { dc, accountsServer } = zoho.resolveCallbackDataCenter({
        accountsServer: rawAccountsServer,
        location,
        storedDc: row.dc,
      });
      const tokens = await zoho.exchangeZohoCode({ accountsServer, dc, code, redirectUri: row.redirect_uri });
      const orgName = await zoho.resolveOrgName(tokens.apiDomain, tokens.accessToken);
      await zoho.saveZohoConnection(row.user_id, dc, tokens, orgName, accountsServer);
      return appRedirect({ zoho_connected: "1" });
    } catch (e) {
      const msg = e instanceof Error ? sanitizeOAuthError(e.message) : "callback_failed";
      console.error("Zoho OAuth callback failed:", msg);
      return appRedirect({ zoho_error: "We couldn't finish connecting Zoho CRM. Please try again." });
    }
  }

  return new Response("unknown_provider", { status: 404 });
});
