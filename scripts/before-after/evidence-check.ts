import { createClient } from "@supabase/supabase-js";
import { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } from "@/lib/ingest-row-normalize";
import { applyAliases, resolveIdentities, type CustomerAlias } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { DEFAULT_METRIC_WEIGHTS, type PlannerMetric } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";
import * as NewApp from "@/lib/real-scoring";
import { snapshotHasEvidence } from "@/lib/customer-score-snapshot";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function readAll(t: string, s: string, u: string, a = false) { const out: any[] = []; for (let f = 0; ; f += INGEST_PAGE) { let q = db.from(t).select(s).eq("user_id", u); if (a) q = q.eq("paused", false); const { data, error } = await q.order("id").range(f, f + INGEST_PAGE - 1); if (error) throw error; out.push(...(data ?? [])); if ((data ?? []).length < INGEST_PAGE) break; } return out; }
const { data: profiles } = await db.from("profiles").select("id, company, metrics, metric_weights, segments");
for (const p of profiles ?? []) {
  const u = p.id; const metrics = (p.metrics ?? []) as PlannerMetric[];
  const { data: saved } = await db.from("customer_scores").select("customer_id, score, risk_level, score_breakdown").eq("user_id", u).eq("is_latest", true).limit(5000);
  const empty = (saved ?? []).filter((r) => !snapshotHasEvidence(r.score_breakdown));
  const [customers, transactions, support, usage, surveys] = await Promise.all([
    readAll("ingested_customers", "id, data, customer_id, batch_id", u, true), readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id", u),
    readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id", u), readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id", u), readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id", u)]);
  if (!customers.length && !(saved ?? []).length) continue;
  const { data: batches } = await db.from("ingest_batches").select("id, source_kind, source_provider").eq("user_id", u);
  const src = new Map((batches ?? []).map((b) => [b.id, batchSource(b.source_kind, b.source_provider)]));
  const norm = (rows: any[], k: string) => rows.map((r) => normalizeIngestRow(r, INGEST_COLUMNS[k]!, src.get(String(r.batch_id ?? "")) ?? undefined));
  const raw: IngestedData = { customers: norm(customers, "customers"), transactions: norm(transactions, "transactions"), support: norm(support, "support"), usage: norm(usage, "usage"), surveys: norm(surveys, "surveys") };
  const { data: al } = await db.from("customer_id_aliases").select("source, source_id, customer_id, status, match_method, match_reason").eq("user_id", u);
  const data = mergeRoster(applyAliases(resolveIdentities(raw), (al ?? []) as CustomerAlias[]), (al ?? []) as CustomerAlias[]);
  const w: any = { ...(p.metric_weights && Object.keys(p.metric_weights).length ? p.metric_weights : DEFAULT_METRIC_WEIGHTS) }; for (const m of metrics) if (w[m.name] == null) w[m.name] = m.weight ?? 3;
  const ds = NewApp.buildRealDataset(data, w, { segments: p.segments ?? [], metrics } as never);
  const live = new Map(ds.customers.map((c) => [c.id, c]));
  const e = ds.executive; const ned = ds.customers.filter((c) => c.notEnoughData).length;
  let real = 0, nd = 0, missing = 0; const reals: string[] = [];
  for (const r of empty) { const c = live.get(r.customer_id); if (!c) missing++; else if (c.notEnoughData) nd++; else { real++; reals.push(`${c.name} ${c.health}`); } }
  console.log(`${p.company || u}: saved=${(saved ?? []).length} emptySaved=${empty.length} -> real=${real} [${reals.join("; ")}] notEnough=${nd} notInRoster=${missing} | dashboard healthy=${e.healthy} watch=${e.watch} atRisk=${e.atRisk} critical=${e.critical} notEnough=${ned}`);
}
