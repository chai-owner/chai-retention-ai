// Public cron endpoint (daily, 06:35 UTC via pg_cron). Applies scheduled
// downgrades whose paid period has ended, and reverts workspaces to Core
// limits once a canceled subscription's access window has passed.
//
// Auth: pg_cron sends the server-only CRON_SECRET in the `x-cron-secret`
// header, exactly like the daily scoring job.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

import { pendingChangeDue, PLAN_PRICE_IDS } from "@/lib/paddle-shared";
import type { PaddleEnv } from "@/lib/paddle.server";

export const Route = createFileRoute("/api/public/hooks/plan-changes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (
          !expected ||
          provided.length !== expected.length ||
          !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
        ) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolvePaddlePriceId, updateSubscriptionItems } = await import(
          "@/lib/paddle.server"
        );

        const results = { downgradesApplied: 0, cancellationsFinalised: 0, errors: 0 };

        // 1. Due downgrades: swap the subscription items without billing
        //    anything (the new, lower price starts from the next invoice).
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
              // Nothing to change at Paddle — just apply the local plan.
              await supabaseAdmin
                .from("organisations")
                .update({
                  plan: org.pending_plan,
                  pending_plan: null,
                  pending_plan_effective_at: null,
                })
                .eq("id", org.id);
              results.downgradesApplied++;
              continue;
            }
            const period = sub.billing_interval === "year" ? "annual" : "monthly";
            const priceId = await resolvePaddlePriceId(
              sub.environment as PaddleEnv,
              PLAN_PRICE_IDS[org.pending_plan as keyof typeof PLAN_PRICE_IDS][period],
            );
            await updateSubscriptionItems(
              sub.environment as PaddleEnv,
              sub.provider_subscription_id,
              [priceId],
              "do_not_bill",
            );
            // The subscription.updated webhook flips the org plan; clear the
            // pending marker here too in case the webhook is delayed.
            await supabaseAdmin
              .from("organisations")
              .update({
                plan: org.pending_plan,
                pending_plan: null,
                pending_plan_effective_at: null,
              })
              .eq("id", org.id);
            results.downgradesApplied++;
          } catch (error) {
            console.error("plan-changes: downgrade failed for org", org.id, error);
            results.errors++;
          }
        }

        // 2. Canceled subscriptions past their paid-through date: revert the
        //    workspace to Core limits and drop the add-on.
        const now = new Date().toISOString();
        const { data: expired } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("provider", "paddle")
          .eq("status", "canceled")
          .lt("current_period_end", now);

        for (const sub of expired ?? []) {
          try {
            // Skip users who re-subscribed after canceling.
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
            await supabaseAdmin
              .from("organisations")
              .update({ plan: "core", smart_ingest_addon: false })
              .eq("id", member.org_id);
            results.cancellationsFinalised++;
          } catch (error) {
            console.error("plan-changes: cancellation finalise failed", sub.user_id, error);
            results.errors++;
          }
        }

        return Response.json({ ok: true, ...results });
      },
    },
  },
});
