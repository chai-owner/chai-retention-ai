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
      .select("provider, company_name, connected_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      provider: AccountingProvider;
      company_name: string | null;
      connected_at: string;
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

    const redirectUri = `${data.origin}/api/public/accounting/callback`;
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

    const { error } = await supabaseAdmin.from("accounting_oauth_states").insert({
      state,
      user_id: context.userId,
      provider: data.provider,
      redirect_uri: redirectUri,
    });
    if (error) throw new Error(error.message);

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

