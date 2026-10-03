// Ported from src/routes/api/public/hooks/plan-changes.ts to a standalone
// Supabase Edge Function. Talks directly to Paddle with your own API keys —
// fully self-contained, no Lovable dependency. Logic is unchanged from the
// original.
//
// Note: applyPlanEnforcement() can send a "seat_locked" email if a downgrade
// causes a seat to be over the new plan's limit. That email send goes
// through the same queueTransactionalEmail() as before, which gracefully
// no-ops (logs to email_send_log, does not throw) until a new email
// provider replaces Lovable's — see _shared/transactional-email.ts. All the
// billing-relevant behaviour here (Paddle calls, plan/subscription updates)
// is unaffected by that.
//
// Auth: same shared-secret scheme as the original — pg_cron sends
// CRON_SECRET in the x-cron-secret header.
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { getSupabaseAdmin } from "../_shared/client.ts";
import { applyPlanEnforcement } from "../_shared/plan-enforcement.ts";
import { resolvePaddlePriceId, updateSubscriptionItems } from "../_shared/paddle.ts";
import { pendingChangeDue, PLAN_PRICE_IDS } from "../_shared/paddle-shared.ts";
import type { PaddleEnv } from "../_shared/paddle.ts";

function authorized(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!expected || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseAdmin = await getSupabaseAdmin();
  const results = { downgradesApplied: 0, cancellationsFinalised: 0, errors: 0 };

  // 1. Due downgrades.
  const { data: pendingOrgs } = await supabaseAdmin
    .from("organisations")
    .select("id, pending_plan, pending_plan_effective_at, owner_id")
    .not("pending_plan", "is", null);

  for (const org of pendingOrgs ?? []) {
    if (!pendingChangeDue(org.pending_plan_effective_at)) continue;
    try {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("provider_subscription_id, environment, billing_interval")
        .eq("user_id", org.owner_id)
        .eq("provider", "paddle")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub) {
        await supabaseAdmin
          .from("organisations")
          .update({ plan: org.pending_plan, pending_plan: null, pending_plan_effective_at: null })
          .eq("id", org.id);
        await applyPlanEnforcement(supabaseAdmin, org.id);
        results.downgradesApplied++;
        continue;
      }
      const period = sub.billing_interval === "year" ? "annual" : "monthly";
      const priceId = await resolvePaddlePriceId(
        sub.environment as PaddleEnv,
        // deno-lint-ignore no-explicit-any
        PLAN_PRICE_IDS[org.pending_plan as keyof typeof PLAN_PRICE_IDS][period as any],
      );
      await updateSubscriptionItems(sub.environment as PaddleEnv, sub.provider_subscription_id, [priceId], "do_not_bill");
      await supabaseAdmin
        .from("organisations")
        .update({ plan: org.pending_plan, pending_plan: null, pending_plan_effective_at: null })
        .eq("id", org.id);
      await applyPlanEnforcement(supabaseAdmin, org.id);
      results.downgradesApplied++;
    } catch (error) {
      console.error("plan-changes: downgrade failed for org", org.id, error);
      results.errors++;
    }
  }

  // 2. Canceled subscriptions past their paid-through date.
  const now = new Date().toISOString();
  const { data: expired } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("provider", "paddle")
    .eq("status", "canceled")
    .lt("current_period_end", now);

  for (const sub of expired ?? []) {
    try {
      const { data: active } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("provider", "paddle")
        .in("status", ["active", "trialing"])
        .limit(1)
        .maybeSingle();
      if (active) continue;
      const { data: member } = await supabaseAdmin
        .from("organisation_members")
        .select("org_id")
        .eq("user_id", sub.user_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!member) continue;
      await supabaseAdmin.from("organisations").update({ plan: "core", smart_ingest_addon: false }).eq("id", member.org_id);
      await applyPlanEnforcement(supabaseAdmin, member.org_id);
      results.cancellationsFinalised++;
    } catch (error) {
      console.error("plan-changes: cancellation finalise failed", sub.user_id, error);
      results.errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results }), { status: 200, headers: { "Content-Type": "application/json" } });
});
