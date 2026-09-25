// Before/after comparison on real account data. Read-only: loads every
// account's stored records, scores them with the pre-change engine
// (scripts/before-after/old, from commit 31196bf1) and the current engine,
// and prints who moves and why. Writes nothing to the database.
//
// Run: bun scripts/before-after/compare.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { INGEST_COLUMNS, INGEST_PAGE, normalizeIngestRow, batchSource } from "@/lib/ingest-row-normalize";
import { applyAliases, resolveIdentities, type CustomerAlias } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { DEFAULT_METRIC_WEIGHTS, type MetricWeights, type PlannerMetric } from "@/lib/mock-data";
import type { IngestedData } from "@/lib/ingested-data-store";
import * as NewNightly from "@/lib/customer-scoring";
import * as NewApp from "@/lib/real-scoring";
import * as OldNightly from "./old/customer-scoring";
import * as OldApp from "./old/real-scoring";

let zohoStatus: Record<string, Record<string, string>> = {};
try {
  zohoStatus = JSON.parse(readFileSync("/tmp/zoho_status.json", "utf8"));
} catch {
  /* no overlay */
}

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

type Entry = { metric: string; value?: number; normalised?: number; basis?: string; baseline?: number | null; comparison?: string };
const metricEntries = (b: unknown[]) => (b as Entry[]).filter((e) => typeof e.value === "number");

const { data: profiles, error } = await db
  .from("profiles")
  .select("id, email, company, metrics, metric_weights, segments, cadence, lifespan");
if (error) throw error;

const report: string[] = [];
const csv: string[] = ["account,customer,customer_id,app_before,app_after,nightly_before,nightly_after,confidence_before,confidence_after,confidence_reason,why"];
const log = (s = "") => report.push(s);

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
  const merged = mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases);
  // Stored Zoho deals predate stage tracking; overlay the real stages read
  // live from Zoho (zoho-check.ts) — exactly what the next sync will store.
  const data: IngestedData = {
    ...merged,
    transactions: (merged.transactions ?? []).map((t) => {
      const st = zohoStatus[String((t as Record<string, string>).transaction_id)];
      return st ? { ...t, ...st } : t;
    }),
  };

  // Old nightly used past stored scores as its "own history".
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: hist } = await db
    .from("customer_scores")
    .select("customer_id, scored_at, score_breakdown")
    .eq("user_id", userId)
    .gte("scored_at", since);
  const history: OldNightly.HistoryPoint[] = [];
  for (const row of hist ?? []) {
    const at = Date.parse(String(row.scored_at));
    for (const e of (Array.isArray(row.score_breakdown) ? row.score_breakdown : []) as Entry[]) {
      if (typeof e.metric === "string" && Number.isFinite(Number(e.value)))
        history.push({ customer_id: String(row.customer_id), metric: e.metric, value: Number(e.value), scored_at: at });
    }
  }

  const opts = { cadence: (p.cadence as string) ?? undefined, lifespan: (p.lifespan as string) ?? undefined };
  const nOld = new Map(OldNightly.scoreCustomers(metrics, data, { ...opts, history }).map((s) => [s.customer_id, s]));
  const nNew = new Map(NewNightly.scoreCustomers(metrics, data, opts).map((s) => [s.customer_id, s]));
  const profile = { segments: p.segments ?? [], metrics } as never;
  const w = weightsFor(p.metric_weights as Record<string, number> | null, metrics);
  const aOld = new Map(OldApp.buildRealDataset(data, w, profile).customers.map((c) => [c.id, c]));
  const aNew = new Map(NewApp.buildRealDataset(data, w, profile).customers.map((c) => [c.id, c]));

  const openDeals = (data.transactions ?? []).filter((t) => (t as Record<string, string>).deal_status && (t as Record<string, string>).deal_status !== "won").length;
  const account = `${p.company || "(no company)"} <${p.email || userId}>`;
  log(`## ${account}`);
  log(`customers ${data.customers?.length ?? 0} · invoices/deals ${data.transactions?.length ?? 0} (open/lost deals now excluded: ${openDeals}) · tickets ${data.support?.length ?? 0} · activity ${data.usage?.length ?? 0} · surveys ${data.surveys?.length ?? 0} · metrics ${metrics.length}`);
  log(`nightly scores before ${nOld.size}, after ${nNew.size}`);

  let moved = 0;
  let confMovedCount = 0;
  const basisCount: Record<string, number> = {};
  for (const [id, a1] of aNew) {
    const a0 = aOld.get(id);
    const n0 = nOld.get(id);
    const n1 = nNew.get(id);
    for (const e of n1 ? metricEntries(n1.score_breakdown) : []) basisCount[e.basis!] = (basisCount[e.basis!] ?? 0) + 1;
    const appDelta = a0 ? a1.health - a0.health : 0;
    const nDelta = n0 && n1 ? Number(n1.score) - Number(n0.score) : 0;
    const c0 = a0?.churnConfidence ?? "";
    const c1 = a1.churnConfidence ?? "";
    const nc0 = n0?.churn_confidence ?? "";
    const nc1 = n1?.churn_confidence ?? "";
    const confMoved = c0 !== c1 || nc0 !== nc1;
    if (confMoved) confMovedCount++;
    const reason = a1.confidenceReason ?? "";
    if (Math.abs(appDelta) < 1 && Math.abs(nDelta) < 1 && !!n0 === !!n1 && !confMoved && !reason) continue;
    moved++;
    const why: string[] = [];
    for (const [k, v] of Object.entries(a1.subScores)) {
      const before = a0?.subScores[k];
      if (before != null && Math.abs(before - v) >= 1) why.push(`app ${k}: ${Math.round(before)}→${Math.round(v)}`);
    }
    if (a0) for (const k of Object.keys(a0.subScores)) if (!(k in a1.subScores)) why.push(`app ${k}: dropped`);
    const personalDetails = a1.factors.map((f) => f.detail).filter((d) => /own previous 90 days|usually goes/.test(d));
    if (n1) {
      const old = new Map(n0 ? metricEntries(n0.score_breakdown).map((e) => [e.metric, e]) : []);
      for (const e of metricEntries(n1.score_breakdown)) {
        const o = old.get(e.metric);
        if (!o || Math.abs((o.normalised ?? 0) - (e.normalised ?? 0)) >= 1)
          why.push(`nightly ${e.metric}: ${o ? `${Math.round(o.normalised!)} (${o.basis})` : "—"}→${Math.round(e.normalised!)} (${e.basis})${e.comparison ? ` — ${e.comparison}` : ""}`);
      }
    }
    log(`- ${a1.name} [${id}] — customer page ${a0?.health ?? "—"}→${a1.health}; nightly ${n0 ? Math.round(Number(n0.score)) : "—"}→${n1 ? Math.round(Number(n1.score)) : "—"}`);
    log(`    · confidence (customer page): ${c0 || "—"}→${c1 || "—"}${reason ? ` — "${reason}"` : ""}${n1 || n0 ? `; nightly: ${nc0 || "—"}→${nc1 || "—"}` : ""}`);
    for (const x of why) log(`    · ${x}`);
    for (const d of personalDetails) log(`    » reason shown: ${d}`);
    csv.push([account, a1.name, id, a0?.health ?? "", a1.health, n0 ? Math.round(Number(n0.score)) : "", n1 ? Math.round(Number(n1.score)) : "", c0, c1, reason, why.join(" | ")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }
  log(`listed: ${moved} of ${aNew.size} (score or confidence changed, or a thin-evidence reason now shows); confidence label changed: ${confMovedCount}; nightly comparison used: ${JSON.stringify(basisCount)}`);
  log();
}

writeFileSync("/tmp/before-after.md", report.join("\n"));
writeFileSync("/tmp/before-after.csv", csv.join("\n"));
console.log(report.join("\n"));
