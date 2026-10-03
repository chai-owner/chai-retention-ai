// Ported from src/routes/api/public/hooks/daily-sync.ts (TanStack Start route)
// to a standalone Supabase Edge Function, for pg_cron to call directly.
//
// Behaviour change from the original: Salesforce and HubSpot CRM sync
// depended on Lovable's own connector gateway and are not available here
// (see _shared/crm.ts). runCrmSync() throws a clear error for those two
// providers, which this route's existing per-provider try/catch already
// turns into a logged { ok: false, error } entry in the response — same
// resilience pattern as any other provider failure, no special-casing
// needed. There are currently no Salesforce/HubSpot rows in crm_sync_state
// on this project (connector data was excluded from the migration), so this
// is inert today.
//
// Auth: same shared-secret scheme as the original — pg_cron sends
// CRON_SECRET in the x-cron-secret header.
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { getSupabaseAdmin } from "../_shared/client.ts";
import { fetchAndNormalize } from "../_shared/accounting.ts";
import { runCrmSync, markCrmSynced } from "../_shared/crm.ts";
import { runSupportSync, markSupportSynced } from "../_shared/support.ts";
import { persistDatasetsAdmin } from "../_shared/sync-persist.ts";

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
  const { data: accConns } = await supabaseAdmin.from("accounting_connections").select("user_id, provider, last_synced_at");
  for (const row of accConns ?? []) {
    const userId = row.user_id as string;
    // deno-lint-ignore no-explicit-any
    const provider = row.provider as any;
    try {
      const since = (row.last_synced_at as string | null) ?? null;
      const datasets = await fetchAndNormalize(userId, provider, since);
      const { totalRows } = await persistDatasetsAdmin(userId, "accounting", provider, datasets);
      summaries.push({ user_id: userId, source: "accounting", provider, ok: true, rows: totalRows });
    } catch (err) {
      summaries.push({ user_id: userId, source: "accounting", provider, ok: false, error: (err as Error).message });
    }
  }

  // -------- CRM --------
  const { data: crmRows } = await supabaseAdmin.from("crm_sync_state").select("user_id, provider, last_synced_at");
  for (const row of crmRows ?? []) {
    const userId = row.user_id as string;
    // deno-lint-ignore no-explicit-any
    const provider = row.provider as any;
    try {
      const since = (row.last_synced_at as string | null) ?? null;
      const startedAt = new Date().toISOString();
      const datasets = await runCrmSync(provider, userId, 500, since);
      const { totalRows } = await persistDatasetsAdmin(userId, "crm", provider, datasets);
      await markCrmSynced(userId, provider, startedAt);
      summaries.push({ user_id: userId, source: "crm", provider, ok: true, rows: totalRows });
    } catch (err) {
      summaries.push({ user_id: userId, source: "crm", provider, ok: false, error: (err as Error).message });
    }
  }

  // -------- Support --------
  const { data: supportRows } = await supabaseAdmin.from("support_sync_state").select("user_id, provider, last_synced_at");
  for (const row of supportRows ?? []) {
    const userId = row.user_id as string;
    // deno-lint-ignore no-explicit-any
    const provider = row.provider as any;
    try {
      const since = (row.last_synced_at as string | null) ?? null;
      const startedAt = new Date().toISOString();
      const { datasets, rows } = await runSupportSync(provider, userId, 500, since);
      const { totalRows } = await persistDatasetsAdmin(userId, "support", provider, datasets);
      await markSupportSynced(userId, provider, startedAt);
      summaries.push({ user_id: userId, source: "support", provider, ok: true, rows: totalRows });
    } catch (err) {
      summaries.push({ user_id: userId, source: "support", provider, ok: false, error: (err as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, ran_at: new Date().toISOString(), results: summaries }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
