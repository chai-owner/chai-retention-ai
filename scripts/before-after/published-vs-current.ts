// Read-only: scores every account with a given code tree (ROOT env) and writes
// a JSON snapshot of scores, totals, displayed amounts and nightly-score
// advice. Run once against the published tree and once against the current
// tree, then diff. Writes nothing to the database.
//
// Run: ROOT=/tmp/pub OUT=/tmp/ba-pub.json bun scripts/before-after/published-vs-current.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const ROOT = process.env.ROOT ?? process.cwd();
const L = (p: string) => import(`${ROOT}/src/lib/${p}`);
const { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } = await L("ingest-row-normalize.ts");
const { applyAliases, resolveIdentities } = await L("customer-matching.ts");
const { mergeRoster } = await L("customer-merge.ts");
const { DEFAULT_METRIC_WEIGHTS } = await L("mock-data.ts");
const Nightly = await L("customer-scoring.ts");
const App = await L("real-scoring.ts");
const Snap = await L("customer-score-snapshot.ts");
const { formatCurrency } = await L("format.ts").catch(() => ({ formatCurrency: null }));

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function readAll(table: string, select: string, userId: string, activeOnly = false) {
  const out: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += INGEST_PAGE) {
    let q = db.from(table).select(select).eq("user_id", userId);
    if (activeOnly) q = q.eq("paused", false);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + INGEST_PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as never[]));
    if ((data ?? []).length < INGEST_PAGE) break;
  }
  return out;
}

const { data: profiles, error } = await db.from("profiles").select("*");
if (error) throw error;
const result: Record<string, unknown> = {};
for (const p of profiles ?? []) {
  const userId = p.id as string;
  const metrics = Array.isArray(p.metrics) ? p.metrics : [];
  const [customers, transactions, support, usage, surveys] = await Promise.all([
    readAll("ingested_customers", "id, data, customer_id, batch_id", userId, true),
    readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, currency, occurred_at, batch_id", userId).catch(() =>
      readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id", userId)),
    readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id", userId),
    readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id", userId),
    readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id", userId),
  ]);
  if (customers.length === 0) continue;
  const { data: batches } = await db.from("ingest_batches").select("id, source_kind, source_provider").eq("user_id", userId);
  const src = new Map((batches ?? []).map((b) => [b.id, batchSource(b.source_kind, b.source_provider)]));
  const norm = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.map((r) => normalizeIngestRow(r, INGEST_COLUMNS[key]!, src.get(String(r.batch_id ?? "")) ?? undefined));
  const raw = { customers: norm(customers, "customers"), transactions: norm(transactions, "transactions"), support: norm(support, "support"), usage: norm(usage, "usage"), surveys: norm(surveys, "surveys") };
  const { data: aliasRows } = await db.from("customer_id_aliases").select("source, source_id, customer_id, status, match_method, match_reason").eq("user_id", userId);
  const data = mergeRoster(applyAliases(resolveIdentities(raw), aliasRows ?? []), aliasRows ?? []);
  const currency = (p.data_currency as string) ?? "USD";
  const weights = { ...(p.metric_weights && Object.keys(p.metric_weights).length ? p.metric_weights : DEFAULT_METRIC_WEIGHTS) };
  for (const m of metrics) if (weights[m.name] == null) weights[m.name] = m.weight ?? 3;
  const ds = App.buildRealDataset(data, weights, { segments: p.segments ?? [], metrics, dataCurrency: currency });
  const nightly = Nightly.scoreCustomers(metrics, data, { cadence: p.cadence ?? undefined, lifespan: p.lifespan ?? undefined, currency });
  const fmt = (n: number) => (formatCurrency ? formatCurrency(n, currency) : String(n));
  // Advice on the latest stored nightly score per customer.
  const { data: stored } = await db.from("customer_scores").select("customer_id, scored_at, score, churn_probability, score_breakdown").eq("user_id", userId).order("scored_at", { ascending: false });
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of stored ?? []) if (!latest.has(r.customer_id)) latest.set(r.customer_id, r);
  const byId = new Map(ds.customers.map((c: { id: string }) => [c.id, c]));
  const advice: Record<string, unknown> = {};
  for (const [id, r] of latest) {
    const c = byId.get(id) as { name?: string; revenue?: number } | undefined;
    advice[`${c?.name ?? id} [${id}]`] = Snap.recommendationsFromBreakdown(r.score_breakdown, {
      customerName: c?.name ?? "this customer", revenue: c?.revenue ?? 0,
      churnProbability: Number(r.churn_probability ?? 0), metrics, healthScore: Number(r.score),
    }).map((x: { title: string; reasoning: string; steps?: string[] }) => [x.title, x.reasoning, ...(x.steps ?? [])].join(" | "));
  }
  result[`${p.company || "(no company)"} <${p.email || userId}>`] = {
    customers: Object.fromEntries(ds.customers.map((c: Record<string, unknown>) => [`${c.name} [${c.id}]`, { health: c.health, risk: c.risk, churn: c.churnProbability, revenue: c.revenue, notEnoughData: !!c.notEnoughData }])),
    nightly: Object.fromEntries(nightly.map((s: Record<string, unknown>) => [s.customer_id, { score: s.score, churn: s.churn_probability }])),
    totals: { ...ds.executive, totalRevenue: ds.totalRevenue, shown: [fmt(ds.totalRevenue), fmt(ds.executive.revenueAtRisk), fmt(ds.executive.retentionOpportunity)] },
    advice,
  };
}
writeFileSync(process.env.OUT ?? "/tmp/ba.json", JSON.stringify(result, null, 1));
console.log("accounts", Object.keys(result).length);
