// READ-ONLY dry run of the nightly scoring for one account, before/after content signals.
import { createClient } from "@supabase/supabase-js";
import { scoreCustomers } from "@/lib/customer-scoring";
import { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } from "@/lib/ingest-row-normalize";
import { applyAliases, resolveIdentities } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { applyContentSignals, buildRefResolver, groupSignalsByCustomer, contentEntryOf, removeSignalFromSnapshot } from "@/lib/content-signals/scoring";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const userId = "5debf9d7-bcd9-4485-b9b8-27c247cba6bb";
const readAll = async (t: string, sel: string, active = false) => { const out: any[] = []; for (let f = 0; ; f += INGEST_PAGE) { let q: any = sb.from(t).select(sel).eq("user_id", userId); if (active) q = q.eq("paused", false); const { data, error } = await q.order("id").range(f, f + INGEST_PAGE - 1); if (error) throw error; out.push(...data); if (data.length < INGEST_PAGE) break; } return out; };
const { data: profile } = await sb.from("profiles").select("metrics, cadence, lifespan").eq("id", userId).single();
const [c, t, s, u, v] = await Promise.all([readAll("ingested_customers", "id, data, customer_id, batch_id", true), readAll("ingested_transactions", "id, data, transaction_id, customer_id, amount, occurred_at, batch_id"), readAll("ingested_support", "id, data, ticket_id, customer_id, batch_id"), readAll("ingested_usage", "id, data, customer_id, occurred_at, batch_id"), readAll("ingested_surveys", "id, data, customer_id, submitted_at, batch_id")]);
const { data: batches } = await sb.from("ingest_batches").select("id, source_kind, source_provider").eq("user_id", userId);
const sm = new Map((batches ?? []).map((b: any) => [b.id, batchSource(b.source_kind, b.source_provider)]));
const norm = (rows: any[], k: string) => rows.map((r) => normalizeIngestRow(r, INGEST_COLUMNS[k]!, sm.get(String(r.batch_id)) ?? undefined));
const raw: any = { customers: norm(c, "customers"), transactions: norm(t, "transactions"), support: norm(s, "support"), usage: norm(u, "usage"), surveys: norm(v, "surveys") };
const { data: aliasRows } = await sb.from("customer_id_aliases").select("*").eq("user_id", userId);
const aliases = (aliasRows ?? []) as any[];
const data = mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases);
const scores = scoreCustomers(profile!.metrics as any, data, { cadence: profile!.cadence ?? undefined, lifespan: profile!.lifespan ?? undefined });
console.log("scored customers:", scores.length);
const { data: sig } = await sb.from("content_risk_signals").select("id, signal, source, confidence, occurred_at, detected_at, customer_ref").eq("user_id", userId).is("dismissed_at", null);
const names: Record<string, string> = {}; for (const r of data.customers ?? []) names[String(r.customer_id)] = String((r as any).name ?? "");
const resolve = buildRefResolver(scores.map((x) => x.customer_id), aliases, names);
for (const x of sig ?? []) console.log("signal", x.source, x.signal, x.confidence, "ref", x.customer_ref, "->", resolve(x.customer_ref));
const g = groupSignalsByCustomer(sig as any, resolve);
for (const [id, list] of g) {
  const before = scores.find((x) => x.customer_id === id)!;
  const after = applyContentSignals(before, list);
  console.log(`\n${names[id]} (${id}) before ${before.score} ${before.risk_level} churn ${before.churn_probability}% -> after ${after.score} ${after.risk_level} churn ${after.churn_probability}%`);
  console.log(JSON.stringify(contentEntryOf(after.score_breakdown), null, 1));
  const firstId = contentEntryOf(after.score_breakdown)!.signals[0]!.id;
  const d = removeSignalFromSnapshot(after, firstId);
  console.log("after dismissing", firstId, "->", d.score);
  let cur = after; for (const x of contentEntryOf(after.score_breakdown)!.signals) cur = removeSignalFromSnapshot(cur, x.id);
  console.log("after dismissing all ->", cur.score);
  for (const days of [0, 30, 90, 180]) { const aged = applyContentSignals(before, list.map((x) => ({ ...x, occurred_at: new Date(Date.now() - days * 86400000).toISOString() }))); console.log(`  if ${days}d old -> ${aged.score}`); }
}
console.log("metrics", (profile!.metrics as any[])?.map((m) => m.name), "customers", data.customers?.length, "tx", data.transactions?.length, "support", data.support?.length, "usage", data.usage?.length);
import { resolveMetric } from "@/lib/metric-resolution";
for (const m of (profile!.metrics as any[]) ?? []) { const r = resolveMetric(m, data, Date.now()); console.log(m.name, "->", r.values.size, r.dataset); }
