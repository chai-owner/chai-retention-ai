// Admin-only server functions for the customer console: listing customers,
// unlocking accounts, monitoring AI token usage, and full impersonation.
// Every function verifies the caller holds the 'admin' role before using the
// service-role client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden: admin access required");
}

// Lightweight role probe for the UI: returns whether the caller is an admin
// instead of throwing, so pages can show or hide admin-only controls.
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return Boolean(data);
  });

export interface AdminCustomer {
  id: string;
  fullName: string;
  email: string;
  company: string;
  onboarded: boolean;
  unlocked: boolean;
  bookedAt: string | null;
  createdAt: string;
  totalCostUsd: number;
}

// USD per 1M tokens. Extend as we add models; unknown models fall back to DEFAULT.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview": { input: 0.3, output: 2.5 },
};
const DEFAULT_PRICING = { input: 0.3, output: 2.5 };

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<AdminCustomer[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, company, onboarded, unlocked, booked_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: usage } = await supabaseAdmin
      .from("ai_usage_log")
      .select("user_id, model, input_tokens, output_tokens");

    const costs = new Map<string, number>();
    for (const row of usage ?? []) {
      const price = MODEL_PRICING[row.model] ?? DEFAULT_PRICING;
      const cost =
        ((row.input_tokens ?? 0) / 1_000_000) * price.input +
        ((row.output_tokens ?? 0) / 1_000_000) * price.output;
      costs.set(row.user_id, (costs.get(row.user_id) ?? 0) + cost);
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name ?? "",
      email: p.email ?? "",
      company: p.company ?? "",
      onboarded: p.onboarded ?? false,
      unlocked: p.unlocked ?? false,
      bookedAt: p.booked_at ?? null,
      createdAt: p.created_at,
      totalCostUsd: costs.get(p.id) ?? 0,
    }));
  });

export interface DemoLead {
  id: string;
  name: string;
  email: string;
  company: string;
  website: string | null;
  createdAt: string;
}

// Visitors who submitted their details to view the public demo.
export const listDemoLeads = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<DemoLead[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("demo_leads")
      .select("id, name, email, company, website, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name ?? "",
      email: r.email ?? "",
      company: r.company ?? "",
      website: r.website ?? null,
      createdAt: r.created_at,
    }));
  });


export const setUnlocked = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), unlocked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ unlocked: data.unlocked })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

// Starts full impersonation: records an audit row and mints a one-time
// magic-link token the client verifies to become the target user.
export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userErr || !userRes.user?.email) {
      throw new Error("Target user not found or has no email");
    }
    const email = userRes.user.email;

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData.properties?.hashed_token) {
      throw new Error("Could not create impersonation session");
    }

    const { data: auditRow } = await supabaseAdmin
      .from("impersonation_audit")
      .insert({ admin_id: context.userId, target_id: data.userId })
      .select("id")
      .single();

    return {
      email,
      tokenHash: linkData.properties.hashed_token,
      auditId: auditRow?.id ?? null,
    };
  });

// Ends an impersonation session. Called while acting as the target user, so it
// verifies the caller is that target before stamping ended_at (service role).
export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("impersonation_audit")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.auditId)
      .eq("target_id", context.userId)
      .is("ended_at", null);
    if (error) throw error;
    return { ok: true };
  });

// Wipes every piece of customer data for one account and sends the user back to
// the start of onboarding. Auth login, billing history and AI usage records are
// intentionally preserved; everything the user brought in is removed.
const USER_DATA_TABLES = [
  "ingested_customers",
  "ingested_support",
  "ingested_surveys",
  "ingested_transactions",
  "ingested_usage",
  "ingest_batches",
  "customer_id_aliases",
  "crm_sync_state",
  "support_sync_state",
  "accounting_connections",
  "accounting_oauth_states",
  "app_user_connections",
  "freshdesk_connections",
  "intercom_connections",
  "intercom_oauth_states",
  "zendesk_connections",
  "zendesk_oauth_states",
  "zoho_crm_connections",
  "zoho_crm_oauth_states",
] as const;

export const resetAccount = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    for (const table of USER_DATA_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin.from(table as any) as any)
        .delete()
        .eq("user_id", data.userId);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        company: "",
        industry: "",
        model: "",
        size: "",
        customers: "",
        avg_value: "",
        what_buy: "",
        cadence: "",
        lifespan: "",
        concerns: "",
        segments: [],
        success_actions: "",
        disengagement: "",
        tracked: {},
        channels: [],
        metric_weights: null,
        onboarded: false,
      })
      .eq("id", data.userId);
    if (profileErr) throw profileErr;

    return { ok: true };
  });
