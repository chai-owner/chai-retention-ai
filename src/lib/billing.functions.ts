// Server functions for PayPal subscription billing. Thin wrappers only —
// all runtime helpers live in paypal.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, provider_subscription_id, plan_id, status, payer_email, billing_interval, amount, currency, current_period_end, cancelled_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  });

export const activatePaypalSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string; planId: string }) =>
    z
      .object({ subscriptionId: z.string().min(3).max(64), planId: z.string().min(3).max(64) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fetchPaypalSubscription, paypalConfigured } = await import("@/lib/paypal.server");

    let status = "APPROVAL_PENDING";
    let payerEmail: string | null = null;
    let amount: number | null = null;
    let currency: string | null = null;
    let periodEnd: string | null = null;
    let raw: unknown = null;
    let verified = false;

    if (paypalConfigured()) {
      const sub = await fetchPaypalSubscription(data.subscriptionId);
      // Reject a subscription that isn't for the plan we sell.
      if (sub.plan_id && sub.plan_id !== data.planId) {
        throw new Error("Subscription does not match the ChAi plan");
      }
      status = sub.status ?? status;
      payerEmail = sub.subscriber?.email_address ?? null;
      const last = sub.billing_info?.last_payment?.amount;
      amount = last?.value ? Number(last.value) : null;
      currency = last?.currency_code ?? null;
      periodEnd = sub.billing_info?.next_billing_time ?? null;
      raw = sub;
      verified = true;
    }

    const { error } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        provider: "paypal",
        provider_subscription_id: data.subscriptionId,
        plan_id: data.planId,
        status,
        payer_email: payerEmail,
        billing_interval: "monthly",
        amount,
        currency,
        current_period_end: periodEnd,
        raw: raw as never,
      },
      { onConflict: "provider,provider_subscription_id" },
    );
    if (error) throw error;

    const active = status === "ACTIVE" || status === "APPROVAL_PENDING";
    if (active) {
      await supabase.from("profiles").update({ unlocked: true }).eq("id", userId);
    }

    return { status, verified };
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { cancelPaypalSubscription, paypalConfigured } = await import("@/lib/paypal.server");
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id, provider_subscription_id, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!sub) throw new Error("No subscription found");
    if (paypalConfigured()) {
      await cancelPaypalSubscription(sub.provider_subscription_id, "Cancelled by customer in ChAi");
    }
    await supabase
      .from("subscriptions")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  });
