// Daily customer health scoring.
//
// Server-side port of the weighted health-score calculation in
// src/lib/real-scoring.ts (buildRealDataset). Kept intentionally narrower
// than the client version: it only uses signals available from
// ingested_customers / ingested_transactions / ingested_support /
// ingested_usage (no surveys, no AI-suggested custom metrics, no
// recommendations/timeline/factors) since this function only needs to
// produce a score, a risk bucket and a per-metric breakdown for the daily
// snapshot table. If the two diverge, treat real-scoring.ts as the source of
// truth for "how scoring should feel" and port changes here by hand — this
// file cannot import from the Vite app, it runs in an isolated Deno runtime.
//
// Triggered by the `score-customers-daily` pg_cron job (06:00 UTC) via
// net.http_post, or manually with an optional { "user_id": "<uuid>" } body
// to (re)score a single account on demand.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/mock-data.ts DEFAULT_METRIC_WEIGHTS, minus "Contract renewal
// date" (no data source for it among the four ingested tables this function
// reads).
const DEFAULT_METRIC_WEIGHTS: Record<string, number> = {
  "Login frequency": 5,
  "Feature adoption": 4,
  "CSAT / NPS": 4,
  "Support ticket volume": 3,
  "Days since last purchase": 3,
  "Resolution time": 2,
  "Average order value": 2,
};

const DAY = 86_400_000;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const c = String(v).replace(/[$,\s]/g, "");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): number | null {
  if (!v) return null;
  const t = Date.parse(String(v).trim());
  return Number.isNaN(t) ? null : t;
}

const avg = (a: number[]): number | null =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

function riskLevelFor(score: number): "healthy" | "at-risk" | "critical" {
  if (score >= 70) return "healthy";
  if (score >= 40) return "at-risk";
  return "critical";
}

interface IngestedRow {
  customer_id: string | null;
  amount?: number | null;
  occurred_at?: string | null;
  data: Record<string, unknown> | null;
}

interface CustomerScore {
  customer_id: string;
  score: number;
  risk_level: string;
  score_breakdown: Record<string, number>;
}

function scoreUser(
  customers: { customer_id: string }[],
  transactions: IngestedRow[],
  support: IngestedRow[],
  usage: IngestedRow[],
  weights: Record<string, number>,
): CustomerScore[] {
  const now = Date.now();

  const tx = new Map<string, { amounts: number[]; lastDate: number | null }>();
  for (const r of transactions) {
    const id = r.customer_id;
    if (!id) continue;
    const g = tx.get(id) ?? { amounts: [], lastDate: null };
    const a = num(r.amount) ?? num(r.data?.amount);
    if (a != null) g.amounts.push(a);
    const d = parseDate(r.occurred_at) ?? parseDate(r.data?.transaction_date);
    if (d != null) g.lastDate = Math.max(g.lastDate ?? 0, d);
    tx.set(id, g);
  }

  const sup = new Map<string, { count: number; open: number; sat: number[] }>();
  for (const r of support) {
    const id = r.customer_id;
    if (!id) continue;
    const g = sup.get(id) ?? { count: 0, open: 0, sat: [] };
    g.count++;
    const status = String(r.data?.status ?? "").toLowerCase();
    if (status.includes("open") || status.includes("reopen")) g.open++;
    const s = num(r.data?.satisfaction_score);
    if (s != null) g.sat.push(s);
    sup.set(id, g);
  }

  const usg = new Map<string, { logins: number[]; features: number[] }>();
  for (const r of usage) {
    const id = r.customer_id;
    if (!id) continue;
    const g = usg.get(id) ?? { logins: [], features: [] };
    const l = num(r.data?.logins) ?? num(r.data?.check_in_count) ?? num(r.data?.visit_count);
    if (l != null) g.logins.push(l);
    const f = num(r.data?.features_used);
    if (f != null) g.features.push(f);
    usg.set(id, g);
  }

  const aovByCust = new Map<string, number>();
  for (const [id, g] of tx) {
    const a = avg(g.amounts);
    if (a != null) aovByCust.set(id, a);
  }
  const loginAvgByCust = new Map<string, number>();
  const featAvgByCust = new Map<string, number>();
  for (const [id, g] of usg) {
    const la = avg(g.logins);
    if (la != null) loginAvgByCust.set(id, la);
    const fa = avg(g.features);
    if (fa != null) featAvgByCust.set(id, fa);
  }
  const maxAov = Math.max(1, ...aovByCust.values());
  const maxLogin = Math.max(1, ...loginAvgByCust.values());
  const maxFeat = Math.max(1, ...featAvgByCust.values());
  const maxTickets = Math.max(1, ...[...sup.values()].map((g) => g.count));

  const csatScore = (id: string): number | null => {
    const scores = sup.get(id)?.sat ?? [];
    if (!scores.length) return null;
    const a = avg(scores)!;
    const mx = Math.max(...scores);
    if (mx <= 5) return clamp((a / 5) * 100);
    if (mx <= 10) return clamp((a / 10) * 100);
    return clamp(a);
  };

  return customers
    .filter((c) => c.customer_id)
    .map((c) => {
      const cid = c.customer_id;
      const subScores: Record<string, number> = {};

      if (loginAvgByCust.has(cid))
        subScores["Login frequency"] = clamp((loginAvgByCust.get(cid)! / maxLogin) * 100);
      if (featAvgByCust.has(cid))
        subScores["Feature adoption"] = clamp((featAvgByCust.get(cid)! / maxFeat) * 100);

      const txg = tx.get(cid);
      const days = txg?.lastDate ? (now - txg.lastDate) / DAY : null;
      if (days != null) subScores["Days since last purchase"] = clamp(100 - (days / 180) * 100);
      if (aovByCust.has(cid))
        subScores["Average order value"] = clamp((aovByCust.get(cid)! / maxAov) * 100);

      const supg = sup.get(cid);
      if (supg) {
        subScores["Support ticket volume"] = clamp(100 - (supg.count / maxTickets) * 100);
        subScores["Resolution time"] = clamp(
          100 - (supg.count ? (supg.open / supg.count) * 100 : 0),
        );
      }

      const cs = csatScore(cid);
      if (cs != null) subScores["CSAT / NPS"] = cs;

      let numr = 0;
      let den = 0;
      for (const [metric, subScore] of Object.entries(subScores)) {
        const w = weights[metric] ?? 1;
        if (w <= 0) continue;
        numr += subScore * w;
        den += w;
      }
      // No behavioural signal for this account → neutral "watch" score rather
      // than a fabricated one, matching the client-side fallback.
      const score = den > 0 ? Math.round(numr / den) : 60;

      return {
        customer_id: cid,
        score,
        risk_level: riskLevelFor(score),
        score_breakdown: subScores,
      };
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      if (body?.user_id) targetUserId = String(body.user_id);
    } catch {
      // No/empty body — daily cron run, score every account.
    }

    let userIds: string[];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data, error } = await supabase.from("ingested_customers").select("user_id");
      if (error) throw error;
      userIds = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
    }

    const results: { user_id: string; scored: number; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        const [
          { data: customers },
          { data: transactions },
          { data: support },
          { data: usage },
          { data: profile },
        ] = await Promise.all([
          supabase.from("ingested_customers").select("customer_id").eq("user_id", userId),
          supabase
            .from("ingested_transactions")
            .select("customer_id, amount, occurred_at, data")
            .eq("user_id", userId),
          supabase.from("ingested_support").select("customer_id, data").eq("user_id", userId),
          supabase.from("ingested_usage").select("customer_id, data").eq("user_id", userId),
          supabase.from("profiles").select("metric_weights").eq("id", userId).maybeSingle(),
        ]);

        const weights =
          profile?.metric_weights && Object.keys(profile.metric_weights as object).length > 0
            ? (profile.metric_weights as Record<string, number>)
            : DEFAULT_METRIC_WEIGHTS;

        const scores = scoreUser(
          customers ?? [],
          transactions ?? [],
          support ?? [],
          usage ?? [],
          weights,
        );

        if (scores.length > 0) {
          const { error: rpcError } = await supabase.rpc("replace_customer_scores", {
            p_user_id: userId,
            p_scores: scores,
          });
          if (rpcError) throw rpcError;
        }

        results.push({ user_id: userId, scored: scores.length });
      } catch (err) {
        results.push({
          user_id: userId,
          scored: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed_users: results.length,
        total_customers_scored: results.reduce((s, r) => s + r.scored, 0),
        results,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
