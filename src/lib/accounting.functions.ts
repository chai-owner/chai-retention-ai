// Server functions for the accounting OAuth integrations. These are the
// client-callable RPC boundary; all real work happens in accounting.server.ts
// which is loaded inside the handlers so it never ships to the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.enum(["quickbooks", "xero", "freshbooks"]);
export type AccountingProvider = z.infer<typeof providerSchema>;

export const ACCOUNTING_PROVIDERS: { id: AccountingProvider; name: string }[] = [
  { id: "quickbooks", name: "QuickBooks Online" },
  { id: "xero", name: "Xero" },
  { id: "freshbooks", name: "FreshBooks" },
];

// Which providers have developer credentials configured (client id/secret).
export const getAccountingConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    const { hasCreds } = await import("./accounting.server");
    return {
      quickbooks: hasCreds("quickbooks"),
      xero: hasCreds("xero"),
      freshbooks: hasCreds("freshbooks"),
    } as Record<AccountingProvider, boolean>;
  },
);

// Connection status for the current user (no tokens ever returned).
export const getAccountingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("accounting_connections")
      .select(
        "provider, company_name, connected_at, tenant_id, tenants, status, last_error_at",
      )
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      provider: AccountingProvider;
      company_name: string | null;
      connected_at: string;
      tenant_id: string | null;
      tenants: { tenantId: string; tenantName: string }[] | null;
      status: string | null;
      last_error_at: string | null;
    }[];
  });

// Begins the OAuth flow: stores a state row and returns the provider's
// authorize URL for the browser to redirect to.
export const startAccountingOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: AccountingProvider; origin: string }) =>
    z.object({ provider: providerSchema, origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { buildAuthorizeUrl, getCreds } = await import("./accounting.server");
    getCreds(data.provider); // throws a clear error if not configured
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createOAuthState, resolveRedirectUri } = await import("./oauth-state.server");

    const redirectUri = resolveRedirectUri(
      "ACCOUNTING_REDIRECT_URI",
      "/api/public/accounting/callback",
      data.origin,
    );
    const state = await createOAuthState(supabaseAdmin as never, {
      table: "accounting_oauth_states",
      userId: context.userId,
      provider: data.provider,
      redirectUri,
    });

    return { url: buildAuthorizeUrl(data.provider, redirectUri, state) };
  });


// Pulls live customers + invoices for a connected provider.
export const syncAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: AccountingProvider }) =>
    z.object({ provider: providerSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { fetchAndNormalize } = await import("./accounting.server");
    const datasets = await fetchAndNormalize(context.userId, data.provider);
    return { datasets };
  });

export const disconnectAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: AccountingProvider }) =>
    z.object({ provider: providerSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounting_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Xero can grant access to several organisations at once. Until the user picks
// one we sync all of them; this lets them pin a single organisation.
export const selectXeroTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string | null }) =>
    z.object({ tenantId: z.string().min(1).max(100).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: readErr } = await supabaseAdmin
      .from("accounting_connections")
      .select("tenants")
      .eq("user_id", context.userId)
      .eq("provider", "xero")
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Xero is not connected.");
    const tenants = (row.tenants ?? []) as { tenantId: string; tenantName: string }[];
    const match = data.tenantId
      ? tenants.find((t) => t.tenantId === data.tenantId)
      : null;
    if (data.tenantId && !match) {
      throw new Error("That Xero organisation isn't available on this connection.");
    }
    const { error } = await supabaseAdmin
      .from("accounting_connections")
      .update({
        tenant_id: data.tenantId,
        company_name: match ? match.tenantName : `${tenants.length} organisations`,
      })
      .eq("user_id", context.userId)
      .eq("provider", "xero");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
