// Public cron endpoint. Called once a day (6am UTC) by pg_cron. For every
// account with AI-generated metrics it resolves each metric against the
// account's ingested data, scores every customer 0–100, and atomically swaps
// the stored `customer_scores` snapshot for that account.
//
// Auth: pg_cron sends the server-only CRON_SECRET in the `x-cron-secret`
// header, exactly as the daily integration sync does.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/daily-score")({
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
        const { scoreCustomers } = await import("@/lib/customer-scoring");
        const {
          INGEST_COLUMNS,
          INGEST_PAGE,
          normalizeIngestRow,
          batchSource,
        } = await import("@/lib/ingest-row-normalize");
        type PlannerMetric = import("@/lib/mock-data").PlannerMetric;
        type IngestedData = import("@/lib/ingested-data-store").IngestedData;
        type HistoryPoint = import("@/lib/customer-scoring").HistoryPoint;

        const logRun = async (userId: string, ok: boolean, error?: string) => {
          try {
            await supabaseAdmin.from("ai_usage_log").insert({
              user_id: userId,
              operation: "daily_customer_scoring",
              model: "internal-scoring",
              provider: "internal",
              success: ok,
              error_message: error ?? null,
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
            });
          } catch {
            // Logging must never fail the run.
          }
        };

        const readAll = async (table: string, select: string, userId: string) => {
          const out: Array<Record<string, unknown>> = [];
          for (let from = 0; ; from += INGEST_PAGE) {
            const { data, error } = await supabaseAdmin
              .from(table as "ingested_customers")
              .select(select)
              .eq("user_id", userId)
              .order("id", { ascending: true })
              .range(from, from + INGEST_PAGE - 1);
            if (error) throw new Error(`${table}: ${error.message}`);
            const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
            out.push(...page);
            if (page.length < INGEST_PAGE) break;
          }
          return out;
        };

        const { data: profiles, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id, metrics, cadence, lifespan");
        if (profileError) {
          return new Response(JSON.stringify({ error: profileError.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        type Summary = { user_id: string; ok: boolean; customers?: number; error?: string };
        const results: Summary[] = [];

        for (const profile of profiles ?? []) {
          const userId = profile.id as string;
          const metrics = (Array.isArray(profile.metrics) ? profile.metrics : []) as unknown as PlannerMetric[];
          if (metrics.length === 0) continue;

          try {
            const [customers, transactions, support, usage, surveys, batchRows] = await Promise.all([
              readAll("ingested_customers", "id, data, customer_id, batch_id", userId),
              readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id", userId),
              readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id", userId),
              readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id", userId),
              readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id", userId),
              supabaseAdmin
                .from("ingest_batches")
                .select("id, source_kind, source_provider")
                .eq("user_id", userId)
                .then((r) => (r.data ?? []) as Array<{ id: string; source_kind: string; source_provider: string }>),
            ]);

            const sourceByBatch = new Map(
              batchRows.map((b) => [b.id, batchSource(b.source_kind, b.source_provider)]),
            );
            const fallback = (row: Record<string, unknown>) =>
              sourceByBatch.get(String(row["batch_id"] ?? "")) ?? undefined;
            const normalize = (rows: Array<Record<string, unknown>>, key: string) =>
              rows.map((row) => normalizeIngestRow(row, INGEST_COLUMNS[key]!, fallback(row)));

            const data: IngestedData = {
              customers: normalize(customers, "customers"),
              transactions: normalize(transactions, "transactions"),
              support: normalize(support, "support"),
              usage: normalize(usage, "usage"),
              surveys: normalize(surveys, "surveys"),
            };

            // Baseline history: the last 90 days of stored per-metric values
            // for this account, flattened out of score_breakdown.
            const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
            const { data: historyRows } = await supabaseAdmin
              .from("customer_scores")
              .select("customer_id, scored_at, score_breakdown")
              .eq("user_id", userId)
              .gte("scored_at", since);

            const history: HistoryPoint[] = [];
            for (const row of historyRows ?? []) {
              const at = Date.parse(String(row.scored_at));
              if (!Number.isFinite(at)) continue;
              const entries = Array.isArray(row.score_breakdown) ? row.score_breakdown : [];
              for (const raw of entries) {
                const entry = raw as { metric?: unknown; value?: unknown };
                const value = Number(entry.value);
                if (typeof entry.metric !== "string" || !Number.isFinite(value)) continue;
                history.push({
                  customer_id: String(row.customer_id),
                  metric: entry.metric,
                  value,
                  scored_at: at,
                });
              }
            }

            const scores = scoreCustomers(metrics, data, {
              history,
              cadence: (profile.cadence as string | null) ?? undefined,
              lifespan: (profile.lifespan as string | null) ?? undefined,
            });
            if (scores.length === 0) {
              results.push({ user_id: userId, ok: true, customers: 0 });
              await logRun(userId, true);
              continue;
            }

            const { error: rpcError } = await supabaseAdmin.rpc("replace_customer_scores", {
              p_user_id: userId,
              p_rows: scores as unknown as never,
            });
            if (rpcError) throw new Error(rpcError.message);

            results.push({ user_id: userId, ok: true, customers: scores.length });
            await logRun(userId, true);
          } catch (err) {
            const message = (err as Error).message;
            results.push({ user_id: userId, ok: false, error: message });
            await logRun(userId, false, message);
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
