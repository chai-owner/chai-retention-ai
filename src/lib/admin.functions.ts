// Admin-only server functions for the customer console: listing customers,
// unlocking accounts, monitoring AI token usage, and full impersonation.
// Every function verifies the caller holds the 'admin' role before using the
// service-role client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden: admin access required");
}

export interface AdminCustomer {
  id: string;
  fullName: string;
  email: string;
  company: string;
  onboarded: boolean;
  unlocked: boolean;
  bookedAt: string | null;
  createdAt: string;
  totalTokens: number;
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
      .select("user_id, total_tokens");

    const totals = new Map<string, number>();
    for (const row of usage ?? []) {
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + (row.total_tokens ?? 0));
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
      totalTokens: totals.get(p.id) ?? 0,
    }));
  });

export const setUnlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
