// Talks to the "oauth-start" Supabase Edge Function (supabase/functions/
// oauth-start), which now owns the interactive "Connect X" OAuth flow for
// QuickBooks, Xero, FreshBooks, Zendesk, Intercom and Zoho CRM. This lives on
// Supabase (where the provider Client ID/Secret can actually be set as
// project secrets) instead of a TanStack server function running on this
// app's own hosting, which has no way to hold those secrets.
//
// Client-side only: uses the browser's own Supabase session to prove who is
// connecting, exactly like any other authenticated request this app makes.
import { supabase } from "@/integrations/supabase/client";

function functionsBase(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
  if (!url) throw new Error("VITE_SUPABASE_URL is not set.");
  return `${url}/functions/v1/oauth-start`;
}

export type ConnectorConfig = {
  quickbooks: boolean;
  xero: boolean;
  freshbooks: boolean;
  zendesk: boolean;
  intercom: boolean;
  zoho_crm: boolean;
};

/** Which of the six connectors currently have credentials configured. */
export async function fetchConnectorConfig(): Promise<ConnectorConfig> {
  const res = await fetch(functionsBase(), { method: "GET" });
  if (!res.ok) throw new Error("Couldn't load connector configuration.");
  return (await res.json()) as ConnectorConfig;
}

/**
 * Starts an OAuth connection for the given provider and returns the
 * provider's authorize URL to redirect the browser to.
 */
export async function startConnectorOAuth(
  provider: "quickbooks" | "xero" | "freshbooks" | "zendesk" | "intercom" | "zoho_crm",
  extra?: Record<string, string>,
): Promise<{ url: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again, then retry connecting.");

  const res = await fetch(functionsBase(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ provider, ...extra }),
  });
  // deno-lint-ignore no-explicit-any
  let json: any = null;
  try {
    json = await res.json();
  } catch { /* ignore */ }
  if (!res.ok) throw new Error(json?.error ?? "Failed to start the connection.");
  return json as { url: string };
}
