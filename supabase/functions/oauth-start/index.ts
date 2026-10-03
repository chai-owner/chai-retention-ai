// Begins an interactive "Connect X" OAuth flow for one of ChAi's six
// third-party connectors (QuickBooks, Xero, FreshBooks, Zendesk, Intercom,
// Zoho CRM). Runs on Supabase (where project secrets can actually be set)
// instead of the app's own hosting, which has no way to hold these secrets.
//
// GET returns which providers have credentials configured (no auth needed —
// just booleans, mirrors the old getXConfig() server functions but checked
// against this project's own secrets instead of the app's).
//
// POST is called directly from the browser with the signed-in user's own
// Supabase access token as the Authorization header — this function verifies
// that token itself (getAuthedUserId) in addition to Supabase's own
// platform-level JWT check, so only the authenticated ChAi user can start a
// connection for their own account. Returns { url } for the browser to
// redirect to.
import { getAuthedUserId, UnauthorizedError, CORS_HEADERS } from "../_shared/edge-auth.ts";
import { getSupabaseAdmin } from "../_shared/client.ts";
import { createOAuthState } from "../_shared/oauth-state.ts";
import * as accounting from "../_shared/accounting.ts";
import * as zendesk from "../_shared/zendesk.ts";
import * as intercom from "../_shared/intercom.ts";
import * as zoho from "../_shared/zoho.ts";

const ACCOUNTING_PROVIDERS = new Set(["quickbooks", "xero", "freshbooks"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function hasEnv(name: string): boolean {
  return Boolean(Deno.env.get(name)?.trim());
}

function requiredEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`${name} is not set. This connector is not configured yet.`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  if (req.method === "GET") {
    return json({
      quickbooks: hasEnv("QUICKBOOKS_CLIENT_ID"),
      xero: hasEnv("XERO_CLIENT_ID"),
      freshbooks: hasEnv("FRESHBOOKS_CLIENT_ID"),
      zendesk: hasEnv("ZENDESK_CLIENT_ID"),
      intercom: hasEnv("INTERCOM_CLIENT_ID"),
      zoho_crm: hasEnv("ZOHO_CLIENT_ID"),
    });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId: string;
  try {
    userId = await getAuthedUserId(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return json({ error: e.message }, 401);
    return json({ error: "auth_check_failed" }, 500);
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }

  const provider = String(body?.provider ?? "");
  const db = await getSupabaseAdmin();

  try {
    if (ACCOUNTING_PROVIDERS.has(provider)) {
      const idKey = { quickbooks: "QUICKBOOKS_CLIENT_ID", xero: "XERO_CLIENT_ID", freshbooks: "FRESHBOOKS_CLIENT_ID" }[provider as "quickbooks" | "xero" | "freshbooks"];
      requiredEnv(idKey);
      const redirectUri = requiredEnv("ACCOUNTING_REDIRECT_URI");
      const state = await createOAuthState(db, {
        table: "accounting_oauth_states",
        userId,
        provider,
        redirectUri,
      });
      const url = accounting.buildAuthorizeUrl(provider as "quickbooks" | "xero" | "freshbooks", redirectUri, state);
      return json({ url });
    }

    if (provider === "zendesk") {
      requiredEnv("ZENDESK_CLIENT_ID");
      const subdomainInput = String(body?.subdomain ?? "");
      if (!subdomainInput) return json({ error: "subdomain_required" }, 400);
      const subdomain = zendesk.normalizeSubdomain(subdomainInput);
      const redirectUri = requiredEnv("ZENDESK_REDIRECT_URI");
      // Zendesk deliberately keeps its own state design (not the shared
      // oauth-state.ts table), matching the app's existing implementation.
      const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const { error } = await db.from("zendesk_oauth_states").insert({
        state,
        user_id: userId,
        subdomain,
        redirect_uri: redirectUri,
        expires_at: new Date(Date.now() + zendesk.ZENDESK_STATE_TTL_MS).toISOString(),
      });
      if (error) throw new Error(error.message);
      const url = zendesk.buildZendeskAuthorizeUrl(subdomain, redirectUri, state);
      return json({ url });
    }

    if (provider === "intercom") {
      requiredEnv("INTERCOM_CLIENT_ID");
      const redirectUri = requiredEnv("INTERCOM_REDIRECT_URI");
      const state = await createOAuthState(db, {
        table: "intercom_oauth_states",
        userId,
        provider: "intercom",
        redirectUri,
      });
      const url = intercom.buildIntercomAuthorizeUrl(state, redirectUri);
      return json({ url });
    }

    if (provider === "zoho_crm") {
      requiredEnv("ZOHO_CLIENT_ID");
      const dc = String(body?.dc ?? "") || (Deno.env.get("ZOHO_DATA_CENTER")?.trim() || "com");
      const redirectUri = requiredEnv("ZOHO_REDIRECT_URI");
      const state = await createOAuthState(db, {
        table: "zoho_crm_oauth_states",
        userId,
        provider: "zoho_crm",
        redirectUri,
        extra: { dc },
      });
      const url = zoho.buildZohoAuthorizeUrl(dc, redirectUri, state);
      return json({ url });
    }

    return json({ error: "unknown_provider" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start the connection.";
    console.error(JSON.stringify({ scope: "oauth-start", provider, error: msg }));
    return json({ error: msg }, 400);
  }
});
