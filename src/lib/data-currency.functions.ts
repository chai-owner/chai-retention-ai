// Account data currency: read the setting + suggestion, change it (owners and
// admins only, recorded), and dismiss a suggestion.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeDataCurrency } from "@/lib/money";
import { currencySuggestion, type CurrencySuggestion } from "@/lib/currency-suggestion";

async function canManage(supabase: any): Promise<{ ok: boolean; orgId: string | null }> {
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { ok: false, orgId: null };
  const { data: ok } = await supabase.rpc("can_manage_org", { _org_id: orgId });
  return { ok: ok === true, orgId: orgId as string };
}

export const getDataCurrencyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ currency: "USD" | "ZAR"; canChange: boolean; suggestion: CurrencySuggestion }> => {
      const { supabase, userId } = context;
      const [{ data: profile }, { data: conns }, role] = await Promise.all([
        supabase
          .from("profiles")
          .select("data_currency, data_currency_suggestion_dismissed")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("accounting_connections")
          .select("provider, tenant_currencies")
          .eq("user_id", userId),
        canManage(supabase),
      ]);
      const currency = normalizeDataCurrency(profile?.data_currency);
      return {
        currency,
        canChange: role.ok,
        suggestion: currencySuggestion(
          (conns ?? []) as never,
          currency,
          profile?.data_currency_suggestion_dismissed ?? null,
        ),
      };
    },
  );

export const setDataCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ currency: z.enum(["USD", "ZAR"]), excludedRows: z.number().int().min(0).max(10_000_000) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await canManage(supabase);
    if (!role.ok) throw new Error("Only an account owner or admin can change the data currency.");
    const { data: current } = await supabase
      .from("profiles")
      .select("data_currency")
      .eq("id", userId)
      .maybeSingle();
    const from = normalizeDataCurrency(current?.data_currency);
    if (from === data.currency) return { ok: true, currency: from };
    // The profile guard only lets the server change the setting after onboarding.
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = await getSupabaseAdmin();
    const { error } = await admin
      .from("profiles")
      .update({ data_currency: data.currency, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(`Couldn't change the data currency: ${error.message}`);
    const { error: auditError } = await admin.from("data_currency_changes").insert({
      user_id: userId,
      org_id: role.orgId,
      changed_by: userId,
      from_currency: from,
      to_currency: data.currency,
      excluded_rows: data.excludedRows,
    });
    if (auditError) console.error("[setDataCurrency] audit insert failed", auditError);
    return { ok: true, currency: data.currency };
  });

export const dismissCurrencySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ currency: z.string().max(8) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ data_currency_suggestion_dismissed: data.currency })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
