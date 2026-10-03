// Ported from src/routes/api/public/hooks/trial-lifecycle.ts to a standalone
// Supabase Edge Function (daily, 07:15 UTC via pg_cron). Sends trial reminder
// emails, warns owners a week before a scheduled downgrade locks seats, and
// keeps paused/locked state in step with each workspace's plan.
//
// Auth: same shared-secret scheme as the other cron jobs — pg_cron sends
// CRON_SECRET in the x-cron-secret header.
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import * as React from "npm:react@19";
import { getSupabaseAdmin } from "../_shared/client.ts";
import { APP_ORIGIN } from "../_shared/site.ts";
import { coercePlan, seatsAllowed, type OrgPlan } from "../_shared/organisations.ts";
import { selectMembersToLock, type LockCandidate } from "../_shared/seat-locking.ts";
import type { OrgRole } from "../_shared/organisations.ts";
import { dueTrialEmails, trialState } from "../_shared/trials.ts";
import { applyPlanEnforcement, sendDowngradeSeatWarning } from "../_shared/plan-enforcement.ts";
import { TrialNoticeEmail } from "../_shared/email-templates/trial-notice.tsx";
import { queueTransactionalEmail } from "../_shared/transactional-email.ts";

const UPGRADE_URL = `${APP_ORIGIN}/pricing`;
const WARN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

// deno-lint-ignore no-explicit-any
async function memberSnapshot(admin: any, orgId: string): Promise<LockCandidate[]> {
  const { data } = await admin
    .from("organisation_members")
    .select("id, role, invited_at, locked, locked_at")
    .eq("org_id", orgId);
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    role: (m.role ?? "member") as OrgRole,
    invitedAt: m.invited_at ?? new Date(0).toISOString(),
    locked: Boolean(m.locked),
    lockedAt: m.locked_at ?? null,
  }));
}

// deno-lint-ignore no-explicit-any
function hasExcessSeats(members: LockCandidate[], org: any, trialStatus: string): boolean {
  const plan: OrgPlan =
    trialStatus === "trialing" || trialStatus === "grace" ? "standard" : coercePlan(org.plan);
  return selectMembersToLock(members, seatsAllowed(plan)).length > 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = await getSupabaseAdmin();
  const now = new Date();
  const results = { trialEmails: 0, downgradeWarnings: 0, enforced: 0, errors: 0 };

  const { data: orgs, error } = await supabaseAdmin
    .from("organisations")
    .select(
      "id, name, owner_id, plan, trial_ends_at, trial_emails_sent, pending_plan, pending_plan_effective_at, downgrade_warning_sent_at",
    );
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // deno-lint-ignore no-explicit-any
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

  return new Response(JSON.stringify({ ok: true, ...results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
