// Paddle webhook endpoint. Registered automatically for both environments with
// ?env=sandbox / ?env=live. Public by design — security is the verified
// Paddle-Signature HMAC on every request.
import { createFileRoute } from "@tanstack/react-router";

import { EventName, verifyWebhook, type PaddleEnv } from "@/lib/paddle.server";
import { planForProduct, planPeriodForPrice, ADDON_PRODUCT_ID } from "@/lib/paddle-shared";

let _supabase: any = null;
async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import("@supabase/supabase-js");
    _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
}

const SITE_ORIGIN = "https://chai-retention-ai.lovable.app";
const SENDER_DOMAIN = "notify.askchai.tech";
const FROM_DOMAIN = "askchai.tech";

interface NormalisedItems {
  planProductId: string | null;
  priceExternalId: string | null;
  hasAddon: boolean;
  billingInterval: string | null;
  amount: number | null;
  currency: string | null;
}

function normaliseItems(items: any[] | undefined): NormalisedItems {
  const out: NormalisedItems = {
    planProductId: null,
    priceExternalId: null,
    hasAddon: false,
    billingInterval: null,
    amount: null,
    currency: null,
  };
  for (const item of items ?? []) {
    const productExt = item?.product?.importMeta?.externalId ?? null;
    const priceExt = item?.price?.importMeta?.externalId ?? null;
    if (productExt === ADDON_PRODUCT_ID || priceExt === "smart_ingest_monthly") {
      out.hasAddon = true;
      continue;
    }
    if (productExt && planForProduct(productExt)) {
      out.planProductId = productExt;
      out.priceExternalId = priceExt;
      out.billingInterval = item?.price?.billingCycle?.interval ?? null;
      const unit = item?.price?.unitPrice;
      if (unit?.amount) {
        out.amount = Number(unit.amount) / 100;
        out.currency = unit.currencyCode ?? null;
      }
    }
  }
  return out;
}

async function resolveOrgId(userId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from("organisation_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

async function enqueueEmail(to: string, subject: string, html: string, text: string, label: string) {
  try {
    const messageId = crypto.randomUUID();
    await getSupabase().from("email_send_log").insert({
      message_id: messageId,
      template_name: label,
      recipient_email: to,
      status: "pending",
    });
    await getSupabase().rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to,
        from: `ChAi <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label,
        queued_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Email must never fail the webhook — Paddle would retry for 3 days.
    console.error(`Failed to enqueue ${label} email`, error);
  }
}

async function sendWelcomeAndNotify(userId: string, planLabel: string) {
  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  const email = profile?.email as string | undefined;
  const name = (profile?.full_name as string | undefined) || "there";
  if (email) {
    await enqueueEmail(
      email,
      `Welcome to ChAi ${planLabel}`,
      `<p>Hi ${name},</p><p>Your <strong>ChAi ${planLabel}</strong> subscription is active. Your customer health scores, daily risk brief and weekly digest are ready.</p><p><a href="${SITE_ORIGIN}/app/today">Open your Today brief</a></p><p>— The ChAi team</p>`,
      `Hi ${name},\n\nYour ChAi ${planLabel} subscription is active. Open your Today brief: ${SITE_ORIGIN}/app/today\n\n— The ChAi team`,
      "subscription_welcome",
    );
  }
  // Notify workspace admins (the ChAi team) about the new subscriber.
  const { data: admins } = await getSupabase().from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (admins ?? []).map((a: any) => a.user_id).filter(Boolean);
  if (adminIds.length) {
    const { data: adminProfiles } = await getSupabase()
      .from("profiles")
      .select("email")
      .in("id", adminIds);
    for (const p of adminProfiles ?? []) {
      if (!p.email) continue;
      await enqueueEmail(
        p.email,
        `New ChAi subscriber: ${email ?? userId} (${planLabel})`,
        `<p><strong>${email ?? userId}</strong> just subscribed to <strong>ChAi ${planLabel}</strong>.</p>`,
        `${email ?? userId} just subscribed to ChAi ${planLabel}.`,
        "admin_new_subscriber",
      );
    }
  }
}

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;
  const userId = customData?.userId;
  if (!userId) {
    console.error("subscription.created without customData.userId");
    return;
  }
  const n = normaliseItems(items);
  if (!n.planProductId || !n.priceExternalId) {
    // Products created outside the payments tools carry no external ID — skip
    // rather than store an unmappable row.
    console.warn("Skipping subscription: missing importMeta.externalId", { subscription: id });
    return;
  }

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      provider: "paddle",
      provider_subscription_id: id,
      plan_id: n.planProductId,
      status,
      billing_interval: n.billingInterval ?? "month",
      amount: n.amount,
      currency: n.currency,
      current_period_start: currentBillingPeriod?.startsAt ?? null,
      current_period_end: currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: false,
      environment: env,
      raw: { customerId, priceExternalId: n.priceExternalId, hasAddon: n.hasAddon },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,provider_subscription_id" },
  );

  // Business rule: activate the plan instantly, unlock the account and flag
  // the add-on when it was bought as a second line item.
  const orgId = await resolveOrgId(userId);
  const plan = planForProduct(n.planProductId);
  if (orgId && plan) {
    const update: Record<string, unknown> = { plan, pending_plan: null, pending_plan_effective_at: null };
    if (n.hasAddon) update.smart_ingest_addon = true;
    await getSupabase().from("organisations").update(update).eq("id", orgId);
  }
  await getSupabase().from("profiles").update({ unlocked: true }).eq("id", userId);

  const { PLAN_LABELS } = await import("@/lib/organisations");
  await sendWelcomeAndNotify(userId, plan ? PLAN_LABELS[plan] : "plan");
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange, items } = data;
  const n = normaliseItems(items);

  const { data: row } = await getSupabase()
    .from("subscriptions")
    .update({
      status,
      current_period_start: currentBillingPeriod?.startsAt ?? null,
      current_period_end: currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: scheduledChange?.action === "cancel",
      billing_interval: n.billingInterval ?? undefined,
      raw: undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", id)
    .eq("provider", "paddle")
    .eq("environment", env)
    .select("user_id")
    .maybeSingle();

  // Keep the workspace plan in step with whatever the subscription now bills
  // for (covers in-app upgrades, portal changes and applied downgrades).
  if (row?.user_id && n.planProductId) {
    const plan = planForProduct(n.planProductId);
    const orgId = await resolveOrgId(row.user_id);
    if (orgId && plan) {
      await getSupabase()
        .from("organisations")
        .update({
          plan,
          smart_ingest_addon: n.hasAddon,
          pending_plan: null,
          pending_plan_effective_at: null,
        })
        .eq("id", orgId);
    }
  }
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  // Access continues until current_period_end — the daily plan-changes job
  // reverts the workspace to Core limits once that date passes.
  await getSupabase()
    .from("subscriptions")
    .update({
      status: "canceled",
      cancelled_at: new Date().toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", data.id)
    .eq("provider", "paddle")
    .eq("environment", env);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.eventType) {
            case EventName.SubscriptionCreated:
              await handleSubscriptionCreated(event.data, env);
              break;
            case EventName.SubscriptionUpdated:
              await handleSubscriptionUpdated(event.data, env);
              break;
            case EventName.SubscriptionCanceled:
              await handleSubscriptionCanceled(event.data, env);
              break;
            default:
              console.log("Unhandled Paddle event:", event.eventType);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Paddle webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
