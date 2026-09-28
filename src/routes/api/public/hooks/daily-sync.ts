// Public cron endpoint. Called once a day by pg_cron. Iterates every
// connected accounting integration and CRM sync state row, pulls only
// records changed since the last successful sync, and upserts them into
// the ingested_* tables (so records with the same natural key are updated,
// not duplicated).
//
// Auth: pg_cron sends a dedicated server-only secret (CRON_SECRET) in the
// `x-cron-secret` header. It is never exposed to the client bundle, so random
// public callers can't trigger a sync run.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/daily-sync")({
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

        const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = await getSupabaseAdmin();
        const { fetchAndNormalize } = await import("@/lib/accounting.server");
        const { runCrmSync, markCrmSynced } = await import("@/lib/crm.server");
        const { runSupportSync, markSupportSynced } = await import("@/lib/support.server");
        const { persistDatasetsAdmin } = await import("@/lib/sync-persist.server");
        const { createRunLogger } = await import("@/lib/run-log.server");
        const { classifyError } = await import("@/lib/run-log");

        // Every step is written to the run log as soon as it finishes. Only
        // counts, timings, step names and an error TYPE are kept — never the
        // raw error message, which could echo customer names or text.
        const log = createRunLogger(supabaseAdmin, "daily-sync");
        const runStarted = Date.now();
        await log.record({ user_id: null, source: "run", provider: "all", step: "start", ok: true });

        type Summary = {
          user_id: string;
          source: "accounting" | "crm" | "support" | "content";
          provider: string;
          ok: boolean;
          rows?: number;
          signals?: number;
          error_type?: string;
        };
        const summaries: Summary[] = [];
        const rowsIn = (ds: Array<{ rows?: unknown[] }> | undefined) =>
          (ds ?? []).reduce((n, d) => n + (Array.isArray(d?.rows) ? d.rows.length : 0), 0);

        // -------- Accounting --------
        const { data: accConns } = await supabaseAdmin
          .from("accounting_connections")
          .select("user_id, provider, last_synced_at");
        for (const row of accConns ?? []) {
          const userId = row.user_id as string;
          const provider = row.provider as "quickbooks" | "xero" | "freshbooks";
          const t0 = Date.now();
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const datasets = await fetchAndNormalize(userId, provider, since);
            const { totalRows } = await persistDatasetsAdmin(userId, "accounting", provider, datasets);
            summaries.push({ user_id: userId, source: "accounting", provider, ok: true, rows: totalRows });
            await log.record({
              user_id: userId, source: "accounting", provider, step: "sync", ok: true,
              rows_read: rowsIn(datasets as never), rows_saved: totalRows, duration_ms: Date.now() - t0,
            });
          } catch (err) {
            const error_type = classifyError(err);
            summaries.push({ user_id: userId, source: "accounting", provider, ok: false, error_type });
            await log.record({
              user_id: userId, source: "accounting", provider, step: "sync", ok: false,
              error_type, duration_ms: Date.now() - t0,
            });
          }
        }

        // -------- CRM --------
        const { data: crmRows } = await supabaseAdmin
          .from("crm_sync_state")
          .select("user_id, provider, last_synced_at");
        for (const row of crmRows ?? []) {
          const userId = row.user_id as string;
          const provider = row.provider as "salesforce" | "hubspot" | "zoho_crm";
          const t0 = Date.now();
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const startedAt = new Date().toISOString();
            const datasets = await runCrmSync(provider, userId, 500, since);
            const { totalRows } = await persistDatasetsAdmin(userId, "crm", provider, datasets);
            await markCrmSynced(userId, provider, startedAt);
            summaries.push({ user_id: userId, source: "crm", provider, ok: true, rows: totalRows });
            await log.record({
              user_id: userId, source: "crm", provider, step: since ? "sync_changes" : "sync_full",
              ok: true, rows_read: rowsIn(datasets as never), rows_saved: totalRows,
              duration_ms: Date.now() - t0,
            });
          } catch (err) {
            const error_type = classifyError(err);
            summaries.push({ user_id: userId, source: "crm", provider, ok: false, error_type });
            await log.record({
              user_id: userId, source: "crm", provider, step: "sync", ok: false,
              error_type, duration_ms: Date.now() - t0,
            });
          }
        }

        // -------- Support --------
        const { data: supportRows } = await supabaseAdmin
          .from("support_sync_state")
          .select("user_id, provider, last_synced_at");
        for (const row of supportRows ?? []) {
          const userId = row.user_id as string;
          const provider = row.provider as "zendesk" | "intercom" | "freshdesk";
          const t0 = Date.now();
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const startedAt = new Date().toISOString();
            const { datasets, rows } = await runSupportSync(provider, userId, 500, since);
            const { totalRows } = await persistDatasetsAdmin(userId, "support", provider, datasets);
            await markSupportSynced(userId, provider, startedAt);
            summaries.push({ user_id: userId, source: "support", provider, ok: true, rows: totalRows });
            await log.record({
              user_id: userId, source: "support", provider, step: since ? "sync_changes" : "sync_full",
              ok: true, rows_read: typeof rows === "number" ? rows : rowsIn(datasets as never),
              rows_saved: totalRows, duration_ms: Date.now() - t0,
            });
          } catch (err) {
            const error_type = classifyError(err);
            summaries.push({ user_id: userId, source: "support", provider, ok: false, error_type });
            await log.record({
              user_id: userId, source: "support", provider, step: "sync", ok: false,
              error_type, duration_ms: Date.now() - t0,
            });
          }
        }

        // -------- Content risk signals --------
        // Reads conversation text from every connected content source and
        // extracts risk signals. Each account has its own monthly spend
        // ceiling; a paused account is skipped until the next period.
        // NOTE: the extraction prompt has only been validated against
        // constructed test examples, never against real customer language.
        try {
          const { runContentExtractionForUser, expireConversationBodies } = await import(
            "@/lib/content-signals/pipeline.server"
          );
          await expireConversationBodies();
          const userIds = new Set<string>(
            (supportRows ?? []).map((r) => r.user_id as string),
          );
          const { data: intercomRows } = await supabaseAdmin
            .from("intercom_connections")
            .select("user_id");
          for (const r of intercomRows ?? []) userIds.add(r.user_id as string);
          const { data: zendeskRows } = await supabaseAdmin
            .from("zendesk_connections")
            .select("user_id");
          for (const r of zendeskRows ?? []) userIds.add(r.user_id as string);
          const { data: hubspotRows } = await supabaseAdmin
            .from("app_user_connections")
            .select("user_id")
            .eq("connector_id", "hubspot");
          for (const r of hubspotRows ?? []) userIds.add(r.user_id as string);

          for (const userId of userIds) {
            const t0 = Date.now();
            try {
              const result = await runContentExtractionForUser(userId);
              summaries.push({
                user_id: userId,
                source: "content",
                provider: result.sources.join(",") || "none",
                ok: result.errors.length === 0,
                rows: result.extracted,
                signals: result.signals,
                error_type: result.errors.length ? classifyError(result.errors[0].message) : undefined,
              });
              // One line per source, so e.g. HubSpot notes and emails show
              // their own entry every night — including nights with zero.
              const bySource = result.bySource ?? {};
              const sources = new Set([...result.sources, ...Object.keys(bySource)]);
              if (sources.size === 0) {
                await log.record({
                  user_id: userId, source: "content", provider: "none", step: "no_sources",
                  ok: true, duration_ms: Date.now() - t0,
                });
              }
              for (const src of sources) {
                const s = bySource[src];
                const firstErr = result.errors.find((e) => e.source === src);
                await log.record({
                  user_id: userId,
                  source: "content",
                  provider: src,
                  step: result.pausedForBudget ? "read_paused_budget" : "read_conversations",
                  ok: !firstErr,
                  rows_read: s?.fetched ?? 0,
                  rows_saved: s?.extracted ?? 0,
                  signals: s?.signals ?? 0,
                  duration_ms: s?.fetchMs ?? null,
                  error_type: firstErr ? classifyError(firstErr.message) : null,
                });
              }
            } catch (err) {
              const error_type = classifyError(err);
              summaries.push({ user_id: userId, source: "content", provider: "content", ok: false, error_type });
              await log.record({
                user_id: userId, source: "content", provider: "all", step: "read_conversations",
                ok: false, error_type, duration_ms: Date.now() - t0,
              });
            }
          }
        } catch (err) {
          const error_type = classifyError(err);
          summaries.push({ user_id: "-", source: "content", provider: "content", ok: false, error_type });
          await log.record({
            user_id: null, source: "content", provider: "all", step: "setup", ok: false, error_type,
          });
        }

        await log.record({
          user_id: null, source: "run", provider: "all", step: "finish",
          ok: summaries.every((s) => s.ok), rows_read: summaries.length,
          duration_ms: Date.now() - runStarted,
        });
        await log.purgeOld();

        return new Response(
          JSON.stringify({
            ok: true,
            run_id: log.runId,
            ran_at: new Date().toISOString(),
            results: summaries,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
