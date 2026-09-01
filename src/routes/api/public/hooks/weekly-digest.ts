// Public cron endpoint. Called every Monday at 7am UTC by pg_cron. For each
// workspace owner it builds the same brief the Today screen shows (from the
// stored `customer_scores` snapshots) and queues a digest email through the
// existing transactional email queue.
//
// Auth: pg_cron sends the server-only CRON_SECRET in the `x-cron-secret`
// header, exactly as the daily scoring job does.
import { churnConfidenceLabel } from "@/lib/churn-probability";
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const SITE_ORIGIN = "https://chai-retention-ai.lovable.app";
const SITE_NAME = "chai-retention-ai";
const SENDER_DOMAIN = "notify.askchai.tech";
const FROM_DOMAIN = "askchai.tech";
const TODAY_URL = `${SITE_ORIGIN}/app/today`;

const RISK_LABELS: Record<string, string> = {
  critical: "Critical",
  "at-risk": "At risk",
  healthy: "Healthy",
};

export const Route = createFileRoute("/api/public/hooks/weekly-digest")({
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
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadDailyBrief } = await import("@/lib/daily-brief.server");
        const [{ render }, React, { WeeklyDigestEmail }] = await Promise.all([
          import("@react-email/render"),
          import("react"),
          import("@/lib/email-templates/weekly-digest"),
        ]);

        // Workspace owners only.
        const { data: orgs, error: orgError } = await supabaseAdmin
          .from("organisations")
          .select("id, name, owner_id");
        if (orgError) {
          return new Response(JSON.stringify({ error: orgError.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        type Summary = { user_id: string; queued: boolean; reason?: string };
        const results: Summary[] = [];
        const seen = new Set<string>();

        for (const org of orgs ?? []) {
          const userId = org.owner_id as string;
          if (!userId || seen.has(userId)) continue;
          seen.add(userId);

          try {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("email")
              .eq("id", userId)
              .maybeSingle();
            const email = (profile?.email ?? "").trim().toLowerCase();
            if (!email) {
              results.push({ user_id: userId, queued: false, reason: "no_email" });
              continue;
            }

            // Respect bounces, complaints and unsubscribes.
            const { data: suppressed } = await supabaseAdmin
              .from("suppressed_emails")
              .select("id")
              .eq("email", email)
              .limit(1)
              .maybeSingle();
            if (suppressed) {
              results.push({ user_id: userId, queued: false, reason: "suppressed" });
              continue;
            }

            const brief = await loadDailyBrief(supabaseAdmin, userId, { useAi: true });
            if (brief.totalScored === 0) {
              results.push({ user_id: userId, queued: false, reason: "no_scores" });
              continue;
            }

            // One reusable one-click unsubscribe token per address.
            let unsubscribeToken: string | undefined;
            const { data: existingToken } = await supabaseAdmin
              .from("email_unsubscribe_tokens")
              .select("token")
              .eq("email", email)
              .limit(1)
              .maybeSingle();
            if (existingToken?.token) {
              unsubscribeToken = existingToken.token as string;
            } else {
              const token = crypto.randomUUID();
              const { error: tokenError } = await supabaseAdmin
                .from("email_unsubscribe_tokens")
                .insert({ token, email });
              if (!tokenError) unsubscribeToken = token;
            }

            const element = React.createElement(WeeklyDigestEmail, {
              headline: brief.headline,
              needsAttention: brief.needsAttention,
              criticalCount: brief.criticalCount,
              atRiskCount: brief.atRiskCount,
              movedCount: brief.movedCount,
              declinedCount: brief.declinedCount,
              improvedCount: brief.improvedCount,
              customers: brief.actions.map((a) => ({
                name: a.name,
                score: a.score,
                riskLabel: RISK_LABELS[a.riskLevel] ?? a.riskLevel,
                topMetric: a.topMetric,
                action: a.action,
                churnProbability: a.churnProbability,
                confidenceLabel: churnConfidenceLabel(a.churnConfidence),
              })),
              todayUrl: TODAY_URL,
            });
            const html = await render(element);
            const text = await render(element, { plainText: true });
            const messageId = crypto.randomUUID();

            await supabaseAdmin.from("email_send_log").insert({
              message_id: messageId,
              template_name: "weekly_digest",
              recipient_email: email,
              status: "pending",
            });

            const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: messageId,
                to: email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject: `Your Monday brief: ${brief.needsAttention} customers need attention`,
                html,
                text,
                purpose: "transactional",
                label: "weekly_digest",
                unsubscribe_token: unsubscribeToken,
                queued_at: new Date().toISOString(),
              },
            });
            if (enqueueError) throw new Error(enqueueError.message);
            results.push({ user_id: userId, queued: true });
          } catch (err) {
            results.push({
              user_id: userId,
              queued: false,
              reason: (err as Error).message,
            });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, ran_at: new Date().toISOString(), results }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
