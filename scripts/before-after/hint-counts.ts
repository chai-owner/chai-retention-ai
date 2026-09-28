// Read-only: for every account, the numbers the dashboard "At-risk customers"
// card would show under the current engine (at-risk, critical, not-enough-data
// counts). Writes nothing to the database.
//
// Run: bun scripts/before-after/hint-counts.ts
import { createClient } from "@supabase/supabase-js";
import { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } from "@/lib/ingest-row-normalize";
import { applyAliases, resolveIdentities, type CustomerAlias } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { DEFAULT_METRIC_WEIGHTS, type MetricWeights, type PlannerMetric } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";
import * as NewApp from "@/lib/real-scoring";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function readAll(table: string, select: string, userId: string, activeOnly = false) {
  const out: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += INGEST_PAGE) {
    let q = db.from(table).select(select).eq("user_id", userId);
    if (activeOnly) q = q.eq("paused", false);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + INGEST_PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
    out.push(...page);
    if (page.length < INGEST_PAGE) break;
  }
  return out;
}

function weightsFor(saved: Record<string, number> | null, metrics: PlannerMetric[]): MetricWeights {
  const base: MetricWeights = saved && Object.keys(saved).length ? { ...saved } : { ...DEFAULT_METRIC_WEIGHTS };
  for (const m of metrics) if (base[m.name] == null) base[m.name] = m.weight ?? 3;
  return base;
}

const { data: profiles, error } = await db
  .from("profiles")
  .select("id, email, company, metrics, metric_weights, segments, cadence, lifespan");
if (error) throw error;

for (const p of profiles ?? []) {
  const userId = p.id as string;
  const metrics = (Array.isArray(p.metrics) ? p.metrics : []) as unknown as PlannerMetric[];
  const [customers, transactions, support, usage, surveys] = await Promise.all([
    readAll("ingested_customers", "id, data, customer_id, batch_id", userId, true),
    readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id", userId),
    readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id", userId),
    readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id", userId),
    readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id", userId),
  ]);
  if (customers.length === 0) continue;
  const { data: batches } = await db.from("ingest_batches").select("id, source_kind, source_provider").eq("user_id", userId);
  const src = new Map((batches ?? []).map((b) => [b.id, batchSource(b.source_kind, b.source_provider)]));
  const norm = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.map((r) => normalizeIngestRow(r, INGEST_COLUMNS[key]!, src.get(String(r.batch_id ?? "")) ?? undefined));
  const raw: IngestedData = {
    customers: norm(customers, "customers"),
    transactions: norm(transactions, "transactions"),
    support: norm(support, "support"),
    usage: norm(usage, "usage"),
    surveys: norm(surveys, "surveys"),
  };
  const { data: aliasRows } = await db
    .from("customer_id_aliases")
    .select("source, source_id, customer_id, status, match_method, match_reason")
    .eq("user_id", userId);
  const aliases = (aliasRows ?? []) as unknown as CustomerAlias[];
  const data = mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases);

  const profile = { segments: p.segments ?? [], metrics } as never;
  const w = weightsFor(p.metric_weights as Record<string, number> | null, metrics);
  const ds = NewApp.buildRealDataset(data, w, profile);
  const ned = ds.customers.filter((c) => (c as { notEnoughData?: boolean }).notEnoughData).length;
  const account = `${p.company || "(no company)"} <${p.email || userId}>`;
  console.log(
    `${account}: total ${ds.executive.totalCustomers} · healthy ${ds.executive.healthy} · watch ${ds.executive.watch} · at-risk ${ds.executive.atRisk} · critical ${ds.executive.critical} · not enough data ${ned}`,
  );
  console.log(`  at-risk card: "${NewApp.executiveAtRiskHint ? "" : ""}"`);
}
