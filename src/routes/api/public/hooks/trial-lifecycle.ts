// Public cron endpoint (daily, 07:15 UTC via pg_cron). Sends trial reminder
// emails, warns owners a week before a scheduled downgrade locks seats, and
// keeps paused/locked state in step with each workspace's plan.
//
// Auth: pg_cron sends the server-only CRON_SECRET in the `x-cron-secret`
// header, exactly like the other scheduled jobs.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import * as React from "react";

import { coercePlan, seatsAllowed } from "@/lib/organisations";
import { selectMembersToLock } from "@/lib/seat-locking";
import { dueTrialEmails, trialState } from "@/lib/trials";

const UPGRADE_URL = "https://chai-retention-ai.lovable.app/pricing";
const WARN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/hooks/trial-lifecycle")({
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
        const { queueTransactionalEmail } = await import("@/lib/transactional-email.server");
        const { TrialNoticeEmail } = await import("@/lib/email-templates/trial-notice");
        const { applyPlanEnforcement, sendDowngradeSeatWarning } = await import(
          "@/lib/plan-enforcement.server"
        );

        const now = new Date();
        const results = { trialEmails: 0, downgradeWarnings: 0, enforced: 0, errors: 0 };

        const { data: orgs, error } = await supabaseAdmin
          .from("organisations")
          .select(
            "id, name, owner_id, plan, trial_ends_at, trial_emails_sent, pending_plan, pending_plan_effective_at, downgrade_warning_sent_at",
          );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        for (const org of (orgs ?? []) as any[]) {
          try {
            // 1. Trial reminders to the workspace owner.
            const due = dueTrialEmails(org.trial_ends_at, org.trial_emails_sent ?? [], now);
            if (due.length > 0) {
              const { data: owner } = await supabaseAdmin
                .from("profiles")
                .select("email")
                .eq("id", org.owner_id)
                .maybeSingle();
              const sentKeys: string[] = [...(org.trial_emails_sent ?? [])];
              for (const email of due) {
                if (owner?.email) {
                  const queued = await queueTransactionalEmail(supabaseAdmin, {
                    to: owner.email,
                    subject: email.subject,
                    template: `trial_${email.key}`,
                    element: React.createElement(TrialNoticeEmail, {
                      headline: email.headline,
                      message: email.body,
                      organisationName: org.name || "your workspace",
                      upgradeUrl: UPGRADE_URL,
                    }),
                  });
                  if (queued) results.trialEmails++;
                }
                sentKeys.push(email.key);
              }
              await supabaseAdmin
                .from("organisations")
                .update({ trial_emails_sent: sentKeys })
                .eq("id", org.id);
            }

            // 2. Owner warning 7 days before a scheduled downgrade locks seats.
            if (org.pending_plan && org.pending_plan_effective_at && !org.downgrade_warning_sent_at) {
              const effectiveAt = new Date(org.pending_plan_effective_at).getTime();
              if (effectiveAt - now.getTime() <= WARN_WINDOW_MS && effectiveAt > now.getTime()) {
                const sent = await sendDowngradeSeatWarning(
                  supabaseAdmin,
                  org.id,
                  coercePlan(org.pending_plan),
                  org.pending_plan_effective_at,
                );
                await supabaseAdmin
                  .from("organisations")
                  .update({ downgrade_warning_sent_at: now.toISOString() })
                  .eq("id", org.id);
                if (sent) results.downgradeWarnings++;
              }
            }

            // 3. Keep paused/locked state honest — a trial ending drops the
            //    workspace back to its own plan's limits.
            const state = trialState(org.trial_ends_at, now);
            const needsEnforcement =
              state.status === "expired" ||
              (state.status === "grace" && state.daysLeft <= 1) ||
              hasExcessSeats(await memberSnapshot(supabaseAdmin, org.id), org, state.status);
            if (needsEnforcement) {
              await applyPlanEnforcement(supabaseAdmin, org.id);
              results.enforced++;
            }
          } catch (err) {
            console.error("trial-lifecycle failed for org", org.id, err);
            results.errors++;
          }
        }

        return Response.json({ ok: true, ...results });
      },
    },
  },
});

async function memberSnapshot(admin: any, orgId: string) {
  const { data } = await admin
    .from("organisation_members")
    .select("id, role, invited_at, locked, locked_at")
    .eq("org_id", orgId);
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    role: m.role ?? "member",
    invitedAt: m.invited_at ?? new Date(0).toISOString(),
    locked: Boolean(m.locked),
    lockedAt: m.locked_at ?? null,
  }));
}

function hasExcessSeats(members: any[], org: any, trialStatus: string): boolean {
  const plan =
    trialStatus === "trialing" || trialStatus === "grace" ? "standard" : coercePlan(org.plan);
  return selectMembersToLock(members, seatsAllowed(plan as never)).length > 0;
}
