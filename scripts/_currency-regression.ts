// Temporary read-only regression script; deleted after use.
import { createClient } from "@supabase/supabase-js";
import { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } from "@/lib/ingest-row-normalize";
import { applyAliases, resolveIdentities } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { loadAliases } from "@/lib/support-company-matching.server";
import { buildRealDataset } from "@/lib/real-scoring";
import { scoreCustomers } from "@/lib/customer-scoring";
import { resolveWeights } from "@/lib/use-scored-data";
import { applyAccountCurrency } from "@/lib/currency-rules";
import { formatMoney } from "@/lib/money";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const NOW = Date.now();

async function readAll(table: string, select: string, userId: string, activeOnly = false) {
  const out: any[] = [];
  for (let from = 0; ; from += INGEST_PAGE) {
    let q: any = db.from(table).select(select).eq("user_id", userId);
    if (activeOnly) q = q.eq("paused", false);
    const { data, error } = await q.order("id").range(from, from + INGEST_PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < INGEST_PAGE) break;
  }
  return out;
}

const strip = (d: any) => {
  const o: any = { ...d };
  for (const k of ["transactions", "customers"]) o[k] = (d[k] ?? []).map((r: any) => { const { currency, ...rest } = r; return rest; });
  return o;
};

const { data: profiles } = await db.from("profiles").select("id, company, metrics, metric_weights, cadence, lifespan, segments, model, data_currency");
const report: any[] = [];
for (const p of profiles ?? []) {
  const userId = p.id;
  const [customers, transactions, support, usage, surveys, batches] = await Promise.all([
    readAll("ingested_customers", "id, data, customer_id, batch_id", userId, true),
    readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id", userId),
    readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id", userId),
    readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id", userId),
    readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id", userId),
    db.from("ingest_batches").select("id, source_kind, source_provider").eq("user_id", userId).then((r) => r.data ?? []),
  ]);
  if (customers.length + transactions.length === 0) continue;
  const srcBy = new Map(batches.map((b: any) => [b.id, batchSource(b.source_kind, b.source_provider)]));
  const norm = (rows: any[], key: string) => rows.map((r) => normalizeIngestRow(r, (INGEST_COLUMNS as any)[key], srcBy.get(String(r.batch_id ?? "")) ?? undefined));
  const raw: any = { customers: norm(customers, "customers"), transactions: norm(transactions, "transactions"), support: norm(support, "support"), usage: norm(usage, "usage"), surveys: norm(surveys, "surveys") };
  const aliases = await loadAliases(db as any, userId);
  const data = mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases);
  const metrics = Array.isArray(p.metrics) ? p.metrics : [];
  const profile: any = { segments: p.segments ?? [], metrics, metricWeights: p.metric_weights, cadence: p.cadence, lifespan: p.lifespan, model: p.model, dataCurrency: p.data_currency };
  const weights = resolveWeights(p.metric_weights as any, metrics as any);
  const live = (d: any, cur: string) => buildRealDataset(d, weights, { ...profile, dataCurrency: cur });
  const night = (d: any, cur: string) => (metrics.length ? scoreCustomers(metrics as any, d, { cadence: p.cadence ?? undefined, lifespan: p.lifespan ?? undefined, currency: cur, now: NOW }) : []);
  const before = live(strip(data), "USD"), after = live(data, p.data_currency), zar = live(data, "ZAR");
  const nb = night(strip(data), "USD"), na = night(data, p.data_currency), nz = night(data, "ZAR");
  const sum = (s: any) => ({ revenueAtRisk: s.revenueAtRisk, retentionOpportunity: s.executive.retentionOpportunity, totalRevenue: s.totalRevenue, healthy: s.executive.healthy, watch: s.executive.watch, atRisk: s.executive.atRisk, critical: s.executive.critical, thin: s.customers.filter((c: any) => c.notEnoughData).length, predictedRevenueLoss: s.executive.predictedRevenueLoss });
  const moves = (a: any[], b: any[]) => {
    const m = new Map(a.map((c: any) => [c.id, c]));
    return b.flatMap((c: any) => { const o: any = m.get(c.id); if (!o) return [];
      const dh = c.health - o.health, dc = (c.dataCategories ?? 0) - (o.dataCategories ?? 0);
      const changed = dh !== 0 || o.churnConfidence !== c.churnConfidence || o.notEnoughData !== c.notEnoughData || o.revenue !== c.revenue || o.churnProbability !== c.churnProbability;
      return changed ? [{ name: c.name, health: `${o.health}→${c.health}`, churn: `${o.churnProbability}→${c.churnProbability}`, conf: `${o.churnConfidence}→${c.churnConfidence}`, thin: `${!!o.notEnoughData}→${!!c.notEnoughData}`, revenue: `${o.revenue}→${c.revenue}`, big: Math.abs(dh) >= 5 }] : []; });
  };
  const nmoves = (a: any[], b: any[]) => { const m = new Map(a.map((s) => [s.customer_id, s])); return b.filter((s) => { const o: any = m.get(s.customer_id); return o && (o.score !== s.score || o.churn_confidence !== s.churn_confidence); }).map((s) => { const o: any = m.get(s.customer_id); return `${s.customer_id}: ${o.score}→${s.score} ${o.churn_confidence}→${s.churn_confidence}`; }); };
  const zarText = JSON.stringify({ e: zar.executive, c: zar.customers.map((c: any) => [c.name, formatMoney(c.revenue, "ZAR")]), r: formatMoney(zar.revenueAtRisk, "ZAR"), o: formatMoney(zar.executive.retentionOpportunity, "ZAR") });
  report.push({ company: p.company, currency: p.data_currency, customers: after.customers.length,
    exclusionUSD: applyAccountCurrency(data, "USD").exclusion, exclusionZAR: applyAccountCurrency(data, "ZAR").exclusion,
    before: sum(before), after: sum(after), zar: sum(zar),
    liveMoves: moves(before.customers, after.customers), zarMoves: moves(after.customers, zar.customers).filter((m: any) => m.big).length,
    nightlyMoves: nmoves(nb, na), nightlyZarMoves: nmoves(na, nz).length,
    zarHasDollar: zarText.includes("$"), zarRevenueAtRisk: formatMoney(zar.revenueAtRisk, "ZAR"), zarOpportunity: formatMoney(zar.executive.retentionOpportunity, "ZAR"),
  });
}
await Bun.write("/tmp/currency-regression.json", JSON.stringify(report, null, 1));
console.log("accounts", report.length);
