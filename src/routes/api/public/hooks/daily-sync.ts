// Public cron endpoint. Called once a day by pg_cron. Iterates every
// connected accounting integration and CRM sync state row, pulls only
// records changed since the last successful sync, and upserts them into
// the ingested_* tables (so records with the same natural key are updated,
// not duplicated).
//
// Auth: pg_cron passes the Supabase publishable/anon key as the `apikey`
// header; we compare it (in a timing-safe way) to SUPABASE_PUBLISHABLE_KEY
// so random public callers can't trigger a sync run.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/daily-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
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
        const { fetchAndNormalize } = await import("@/lib/accounting.server");
        const { runCrmSync, markCrmSynced } = await import("@/lib/crm.server");
        const { runSupportSync, markSupportSynced } = await import("@/lib/support.server");
        const { persistDatasetsAdmin } = await import("@/lib/sync-persist.server");

        type Summary = {
          user_id: string;
          source: "accounting" | "crm" | "support";
          provider: string;
          ok: boolean;
          rows?: number;
          error?: string;
        };
        const summaries: Summary[] = [];

        // -------- Accounting --------
        const { data: accConns } = await supabaseAdmin
          .from("accounting_connections")
          .select("user_id, provider, last_synced_at");
        for (const row of accConns ?? []) {
          const userId = row.user_id as string;
          const provider = row.provider as "quickbooks" | "xero" | "freshbooks";
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const datasets = await fetchAndNormalize(userId, provider, since);
            const { totalRows } = await persistDatasetsAdmin(
              userId,
              "accounting",
              provider,
              datasets,
            );
            summaries.push({ user_id: userId, source: "accounting", provider, ok: true, rows: totalRows });
          } catch (err) {
            summaries.push({
              user_id: userId,
              source: "accounting",
              provider,
              ok: false,
              error: (err as Error).message,
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
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const startedAt = new Date().toISOString();
            const datasets = await runCrmSync(provider, userId, 500, since);
            const { totalRows } = await persistDatasetsAdmin(
              userId,
              "crm",
              provider,
              datasets,
            );
            await markCrmSynced(userId, provider, startedAt);
            summaries.push({ user_id: userId, source: "crm", provider, ok: true, rows: totalRows });
          } catch (err) {
            summaries.push({
              user_id: userId,
              source: "crm",
              provider,
              ok: false,
              error: (err as Error).message,
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
          try {
            const since = (row.last_synced_at as string | null) ?? null;
            const startedAt = new Date().toISOString();
            const { datasets, rows } = await runSupportSync(provider, userId, 500, since);
            const { totalRows } = await persistDatasetsAdmin(
              userId,
              "support",
              provider,
              datasets,
            );
            await markSupportSynced(userId, provider, startedAt);
            summaries.push({ user_id: userId, source: "support", provider, ok: true, rows: totalRows });
          } catch (err) {
            summaries.push({
              user_id: userId,
              source: "support",
              provider,
              ok: false,
              error: (err as Error).message,
            });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            ran_at: new Date().toISOString(),
            results: summaries,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
