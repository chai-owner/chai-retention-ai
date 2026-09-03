// Payments server functions: price resolution, subscription lookup, billing
// portal links and plan changes (upgrade now / downgrade at renewal).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import { canViewBilling, type BillingPeriod, type OrgPlan } from "@/lib/organisations";
import {
  ADDON_PRICE_ID,
  PLAN_PRICE_IDS,
  planChangeKind,
  planPeriodForPrice,
  type PlanChangeKind,
} from "@/lib/paddle-shared";
import type { PaddleEnv } from "@/lib/paddle-server.types";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const { paddleFetch } = await import("@/lib/paddle.server");
    const res = await paddleFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const id = json.data?.[0]?.id;
    if (!res.ok || !id) throw new Error("Price not found");
    return id;
  });

export interface SubscriptionSnapshot {
  status: string;
  plan: OrgPlan | null;
  period: BillingPeriod | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: OrgPlan | null;
  pendingPlanEffectiveAt: string | null;
}

interface Ctx {
  userId: string;
  supabase: any;
}

async function loadMembership(context: Ctx, ownerOnly: boolean) {
  const { data: member, error } = await context.supabase
    .from("organisation_members")
    .select("org_id, role, organisations(plan, pending_plan, pending_plan_effective_at)")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("No workspace found for your account.");
  if (ownerOnly && !canViewBilling(member.role as never)) {
    throw new Error("Only the workspace owner can manage billing.");
  }
  const org = Array.isArray(member.organisations) ? member.organisations[0] : member.organisations;
  return {
    orgId: member.org_id as string,
    org: (org ?? {}) as {
      plan?: OrgPlan;
      pending_plan?: OrgPlan | null;
      pending_plan_effective_at?: string | null;
    },
  };
}

async function latestSubscription(supabase: any, userId: string, env: PaddleEnv) {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "paddle")
    .eq("environment", env)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .inputValidator((data: { environment: PaddleEnv }) => data)
  .middleware([requireConnectedAuth])
  .handler(async ({ data, context }): Promise<SubscriptionSnapshot | null> => {
    const ctx = context as unknown as Ctx;
    const [sub, { org }] = await Promise.all([
      latestSubscription(ctx.supabase, ctx.userId, data.environment),
      loadMembership(ctx, false),
    ]);
    if (!sub) {
      return {
        status: "none",
        plan: org.plan ?? null,
        period: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pendingPlan: org.pending_plan ?? null,
        pendingPlanEffectiveAt: org.pending_plan_effective_at ?? null,
      };
    }
    const priceExt = typeof sub.raw?.priceExternalId === "string" ? sub.raw.priceExternalId : null;
    const resolved = planPeriodForPrice(priceExt);
    return {
      status: sub.status,
      plan: resolved?.plan ?? null,
      period:
        resolved?.period ??
        (sub.billing_interval === "year" ? "annual" : sub.billing_interval === "month" ? "monthly" : null),
      currentPeriodEnd: sub.current_period_end ?? null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      pendingPlan: org.pending_plan ?? null,
      pendingPlanEffectiveAt: org.pending_plan_effective_at ?? null,
    };
  });

export const createBillingPortalLink = createServerFn({ method: "POST" })
  .inputValidator((data: { environment: PaddleEnv }) => data)
  .middleware([requireConnectedAuth])
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await loadMembership(ctx, true);
    const sub = await latestSubscription(ctx.supabase, ctx.userId, data.environment);
    const customerId = sub?.raw?.customerId;
    if (!sub || typeof customerId !== "string") {
      throw new Error("No subscription found for your account yet.");
    }
    const { createPortalSession } = await import("@/lib/paddle.server");
    const url = await createPortalSession(data.environment, customerId, [
      sub.provider_subscription_id,
    ]);
    return { url };
  });

const changeInput = z.object({
  environment: z.enum(["sandbox", "live"]),
  plan: z.enum(["core", "standard", "enterprise"]),
  period: z.enum(["monthly", "annual"]),
});

export const requestPlanChange = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => changeInput.parse(raw))
  .middleware([requireConnectedAuth])
  .handler(async ({ data, context }): Promise<{ kind: PlanChangeKind; effectiveAt?: string }> => {
    const ctx = context as unknown as Ctx;
    const { orgId, org } = await loadMembership(ctx, true);
    const sub = await latestSubscription(ctx.supabase, ctx.userId, data.environment);
    if (!sub) throw new Error("No active subscription to change. Please subscribe first.");
    if (!["active", "trialing"].includes(sub.status)) {
      throw new Error("Your subscription isn't active, so it can't be changed right now.");
    }

    const priceExt = typeof sub.raw?.priceExternalId === "string" ? sub.raw.priceExternalId : null;
    const current = planPeriodForPrice(priceExt);
    const currentPlan: OrgPlan = current?.plan ?? org.plan ?? "core";
    const currentPeriod: BillingPeriod =
      current?.period ?? (sub.billing_interval === "year" ? "annual" : "monthly");

    const kind = planChangeKind(currentPlan, currentPeriod, data.plan, data.period);
    if (kind === "same") return { kind };

    const { resolvePaddlePriceId, updateSubscriptionItems } = await import("@/lib/paddle.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Keep any add-on the subscription already carries. Paddle requires all
    // recurring items to share a billing interval, so the monthly add-on can
    // only persist on monthly plans.
    const keepAddon = !!sub.raw?.hasAddon && data.period === "monthly";

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
      // The subscription.updated webhook also flips the plan; do it here so
      // limits lift even if the webhook is delayed.
      await supabaseAdmin
        .from("organisations")
        .update({ plan: data.plan, pending_plan: null, pending_plan_effective_at: null })
        .eq("id", orgId);
      return { kind };
    }

    // Downgrade: remember the target; the daily plan-changes job swaps the
    // Paddle items once the current paid period ends.
    await supabaseAdmin
      .from("organisations")
      .update({
        pending_plan: data.plan,
        pending_plan_effective_at: sub.current_period_end ?? null,
      })
      .eq("id", orgId);
    return { kind, effectiveAt: sub.current_period_end ?? undefined };
  });
