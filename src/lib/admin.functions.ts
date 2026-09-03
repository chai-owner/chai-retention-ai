// Admin-only server functions for the customer console: listing customers,
// unlocking accounts, monitoring AI token usage, and full impersonation.
// Every function verifies the caller holds the 'admin' role before using the
// service-role client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import {
  impersonationEndReason,
  impersonationExpiresAt,
  type ImpersonationEndReason,
} from "@/lib/impersonation-policy";

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
const IMPERSONATION_COOKIE = "chai-impersonation";

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

    const { data: auditRow, error: auditError } = await supabaseAdmin
      .from("impersonation_audit")
      .insert({ admin_id: context.userId, target_id: data.userId })
      .select("id, started_at")
      .single();
    if (auditError || !auditRow) {
      throw new Error("Could not create the impersonation audit record");
    }
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(IMPERSONATION_COOKIE, auditRow.id, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });

    return {
      email,
      tokenHash: linkData.properties.hashed_token,
      auditId: auditRow.id,
      expiresAt: impersonationExpiresAt(auditRow.started_at),
    };
  });

async function closeImpersonation(
  auditId: string,
  targetId: string,
): Promise<{ active: false; reason: ImpersonationEndReason }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error: readError } = await supabaseAdmin
    .from("impersonation_audit")
    .select("started_at, ended_at, end_reason")
    .eq("id", auditId)
    .eq("target_id", targetId)
    .maybeSingle();
  if (readError || !row) throw new Error("Impersonation session not found");

  if (row.ended_at) {
    return { active: false, reason: row.end_reason === "timeout" ? "timeout" : "manual" };
  }

  const reason: ImpersonationEndReason = impersonationEndReason(row.started_at);
  const { error: updateError } = await supabaseAdmin
    .from("impersonation_audit")
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq("id", auditId)
    .eq("target_id", targetId)
    .is("ended_at", null);
  if (updateError) throw updateError;
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(IMPERSONATION_COOKIE, { path: "/" });
  return { active: false, reason };
}

// The target session checks this server-authoritative deadline on mount, focus,
// and periodically. Expired sessions are atomically closed as timeouts.
export const getImpersonationStatus = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("impersonation_audit")
      .select("started_at, ended_at, end_reason")
      .eq("id", data.auditId)
      .eq("target_id", context.userId)
      .maybeSingle();
    if (error || !row) throw new Error("Impersonation session not found");

    const expiresAt = impersonationExpiresAt(row.started_at);
    if (row.ended_at) {
      const { deleteCookie } = await import("@tanstack/react-start/server");
      deleteCookie(IMPERSONATION_COOKIE, { path: "/" });
      return {
        active: false as const,
        expiresAt,
        reason: row.end_reason === "timeout" ? "timeout" as const : "manual" as const,
      };
    }
    if (Date.now() >= Date.parse(expiresAt)) {
      const closed = await closeImpersonation(data.auditId, context.userId);
      return { ...closed, expiresAt };
    }
    return { active: true as const, expiresAt, reason: null };
  });

// Ends an impersonation session. The server derives whether the ending is
// manual or a timeout from its own authoritative clock.
export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    z.object({ auditId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    return closeImpersonation(data.auditId, context.userId);
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

// ---------------------------------------------------------------------------
// Billing admin: overview of every customer's Paddle subscription plus the
// admin-only actions (refund, cancel, plan change, portal link).
// ---------------------------------------------------------------------------

export interface AdminBillingRow {
  userId: string;
  fullName: string;
  email: string;
  plan: OrgPlan | null;
  period: BillingPeriod | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: OrgPlan | null;
  pendingPlanEffectiveAt: string | null;
  subscriptionId: string | null;
  monthlyValueUsd: number;
}

const envInput = z.object({ environment: z.enum(["sandbox", "live"]) });

function monthlyValue(plan: OrgPlan | null, period: BillingPeriod | null): number {
  if (!plan) return 0;
  const p = PLAN_PRICING[plan];
  return period === "annual" ? p.annualMonthly : p.monthly;
}

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export const listBilling = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => envInput.parse(input))
  .handler(async ({ data, context }): Promise<AdminBillingRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: subs }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email"),
      supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("provider", "paddle")
        .eq("environment", data.environment)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("organisation_members")
        .select("user_id, organisations(plan, pending_plan, pending_plan_effective_at)"),
    ]);

    const orgByUser = new Map<string, any>();
    for (const m of members ?? []) {
      const org = Array.isArray(m.organisations) ? m.organisations[0] : m.organisations;
      if (org && !orgByUser.has(m.user_id)) orgByUser.set(m.user_id, org);
    }

    // Newest subscription per user (list is already newest-first).
    const subByUser = new Map<string, any>();
    for (const s of subs ?? []) if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, s);

    const rows: AdminBillingRow[] = [];
    for (const p of profiles ?? []) {
      const sub = subByUser.get(p.id);
      const org = orgByUser.get(p.id);
      if (!sub && !org) continue;

      const priceExt =
        sub && typeof (sub.raw as any)?.priceExternalId === "string"
          ? ((sub.raw as any).priceExternalId as string)
          : null;
      const resolved = planPeriodForPrice(priceExt);
      const plan: OrgPlan | null = resolved?.plan ?? (org?.plan ?? null);
      const period: BillingPeriod | null =
        resolved?.period ??
        (sub?.billing_interval === "year" ? "annual" : sub?.billing_interval === "month" ? "monthly" : null);
      const status = sub?.status ?? "none";

      rows.push({
        userId: p.id,
        fullName: p.full_name ?? "",
        email: p.email ?? "",
        plan,
        period,
        status,
        currentPeriodEnd: sub?.current_period_end ?? null,
        cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
        pendingPlan: (org?.pending_plan as OrgPlan | null) ?? null,
        pendingPlanEffectiveAt: org?.pending_plan_effective_at ?? null,
        subscriptionId: sub?.provider_subscription_id ?? null,
        monthlyValueUsd: ACTIVE_STATUSES.includes(status) ? monthlyValue(plan, period) : 0,
      });
    }
    rows.sort((a, b) => b.monthlyValueUsd - a.monthlyValueUsd);
    return rows;
  });

async function adminLatestSubscription(userId: string, env: PaddleEnv) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "paddle")
    .eq("environment", env)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("This customer has no subscription yet.");
  return data as any;
}

const userEnvInput = envInput.extend({ userId: z.string().uuid() });

export const adminRefundLastPayment = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => userEnvInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sub = await adminLatestSubscription(data.userId, data.environment);
    const { latestCompletedTransaction, refundTransaction } = await import("@/lib/paddle.server");
    const txn = await latestCompletedTransaction(data.environment, sub.provider_subscription_id);
    if (!txn) throw new Error("No completed payment to refund.");
    await refundTransaction(data.environment, txn.id, "Refund issued by ChAi support");
    return { amount: txn.amount, currency: txn.currency };
  });

/** Amount of the most recent completed payment, for the confirmation dialog. */
export const adminLastPayment = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => userEnvInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sub = await adminLatestSubscription(data.userId, data.environment);
    const { latestCompletedTransaction } = await import("@/lib/paddle.server");
    return latestCompletedTransaction(data.environment, sub.provider_subscription_id);
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    userEnvInput.extend({ immediately: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sub = await adminLatestSubscription(data.userId, data.environment);
    const { cancelSubscription } = await import("@/lib/paddle.server");
    await cancelSubscription(data.environment, sub.provider_subscription_id, data.immediately);
    return {
      immediately: data.immediately,
      accessUntil: data.immediately ? null : (sub.current_period_end ?? null),
    };
  });

export const adminOpenPortal = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) => userEnvInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sub = await adminLatestSubscription(data.userId, data.environment);
    const customerId = (sub.raw as any)?.customerId;
    if (typeof customerId !== "string") throw new Error("No Paddle customer on this subscription.");
    const { createPortalSession } = await import("@/lib/paddle.server");
    const url = await createPortalSession(data.environment, customerId, [
      sub.provider_subscription_id,
    ]);
    return { url };
  });

/**
 * Change a customer's plan on their behalf. Mirrors the customer-facing
 * `requestPlanChange` rules: upgrades bill immediately (prorated), downgrades
 * are scheduled for the end of the current paid period.
 */
export const adminChangePlan = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: unknown) =>
    userEnvInput
      .extend({
        plan: z.enum(["core", "standard", "enterprise"]),
        period: z.enum(["monthly", "annual"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ kind: PlanChangeKind; effectiveAt?: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sub = await adminLatestSubscription(data.userId, data.environment);
    if (!["active", "trialing"].includes(sub.status)) {
      throw new Error("This subscription isn't active, so it can't be changed.");
    }

    const { data: member } = await supabaseAdmin
      .from("organisation_members")
      .select("org_id, organisations(plan)")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const org = member
      ? ((Array.isArray(member.organisations) ? member.organisations[0] : member.organisations) as any)
      : null;

    const priceExt =
      typeof (sub.raw as any)?.priceExternalId === "string"
        ? ((sub.raw as any).priceExternalId as string)
        : null;
    const current = planPeriodForPrice(priceExt);
    const currentPlan: OrgPlan = current?.plan ?? org?.plan ?? "core";
    const currentPeriod: BillingPeriod =
      current?.period ?? (sub.billing_interval === "year" ? "annual" : "monthly");

    const kind = planChangeKind(currentPlan, currentPeriod, data.plan, data.period);
    if (kind === "same") return { kind };

    const { resolvePaddlePriceId, updateSubscriptionItems } = await import("@/lib/paddle.server");
    const keepAddon = !!(sub.raw as any)?.hasAddon && data.period === "monthly";

    if (kind === "upgrade-now") {
      const priceIds = [
        await resolvePaddlePriceId(data.environment, PLAN_PRICE_IDS[data.plan][data.period]),
      ];
      if (keepAddon) priceIds.push(await resolvePaddlePriceId(data.environment, ADDON_PRICE_ID));
      await updateSubscriptionItems(
        data.environment,
        sub.provider_subscription_id,
        priceIds,
        "prorated_immediately",
      );
      if (member?.org_id) {
        await supabaseAdmin
          .from("organisations")
          .update({ plan: data.plan, pending_plan: null, pending_plan_effective_at: null })
          .eq("id", member.org_id);
      }
      return { kind };
    }

    if (member?.org_id) {
      await supabaseAdmin
        .from("organisations")
        .update({
          pending_plan: data.plan,
          pending_plan_effective_at: sub.current_period_end ?? null,
        })
        .eq("id", member.org_id);
    }
    return { kind, effectiveAt: sub.current_period_end ?? undefined };
  });
