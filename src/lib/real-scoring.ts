// True per-customer risk scoring computed from the rows the user actually
// uploaded or synced (see ingested-data-store.ts). No demo data is involved:
// if a signal is absent for a customer, that metric is simply excluded from
// their weighted health score rather than being invented.
import {
  type Customer,
  type ScoredDataset,
  type RiskCategory,
  type Factor,
  type Recommendation,
  type TimelineEvent,
  categoryFromHealth,
  METRIC_NAMES,
  type MetricWeights,
} from "@/lib/mock-data";
import type { OnboardingProfile, ProfileSegment } from "@/lib/profile-store";
import type { IngestedData } from "@/lib/ingested-data-store";
import { customMetricKeys, type CustomMetricKey } from "@/lib/personalize-data";


const DAY = 86400000;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function num(v?: string): number | null {
  if (v == null) return null;
  const c = v.replace(/[$,\s]/g, "");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
function parseDate(v?: string): number | null {
  if (!v) return null;
  const t = Date.parse(v.trim());
  return Number.isNaN(t) ? null : t;
}
const avg = (a: number[]): number | null =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

export interface Sufficiency {
  customerCount: number;
  transactionCount: number;
  supportCount: number;
  usageCount: number;
  surveyCount: number;
  signalDatasets: number;
  enough: boolean;
  reason: string;
}

export function assessSufficiency(data: IngestedData): Sufficiency {
  const customerCount = (data.customers ?? []).length;
  const transactionCount = (data.transactions ?? []).length;
  const supportCount = (data.support ?? []).length;
  const usageCount = (data.usage ?? []).length;
  const surveyCount = (data.surveys ?? []).length;
  const signalDatasets = [transactionCount, supportCount, usageCount, surveyCount].filter(
    (n) => n > 0,
  ).length;
  // "Enough for an accurate snapshot": a real customer list plus at least one
  // behavioural signal to score them against.
  const enough = customerCount >= 3 && signalDatasets >= 1;

  let reason = "";
  if (customerCount === 0) reason = "No customer records have been added yet.";
  else if (customerCount < 3) reason = "Only a handful of customers were added.";
  else if (signalDatasets === 0)
    reason = "Customers were added, but no transactions, usage, support or survey data to score them against.";

  return {
    customerCount,
    transactionCount,
    supportCount,
    usageCount,
    surveyCount,
    signalDatasets,
    enough,
    reason,
  };
}

const REC_FOR: Record<string, Omit<Recommendation, "revenueSaved">> = {
  "No recent purchases": {
    title: "Launch a re-engagement campaign",
    priority: "High",
    difficulty: "Moderate",
    impact: "Strong",
    reasoning: "Buying activity has stalled well past this account's normal cadence — a guided campaign brings them back before the gap becomes a cancellation.",
  },
  "High support volume": {
    title: "Resolve open support issues",
    priority: "High",
    difficulty: "Easy",
    impact: "Strong",
    reasoning: "A spike in tickets is a leading churn signal. Closing them removes the most immediate source of frustration.",
  },
  "Unresolved support tickets": {
    title: "Clear the open ticket backlog",
    priority: "High",
    difficulty: "Easy",
    impact: "Strong",
    reasoning: "Open and reopened tickets are the top churn driver here — resolving them rebuilds confidence fast.",
  },
  "Declining satisfaction": {
    title: "Schedule an executive check-in",
    priority: "High",
    difficulty: "Moderate",
    impact: "Strong",
    reasoning: "Low satisfaction scores mean trust is eroding — direct senior contact is the fastest way to reset the relationship.",
  },
  "Usage declining": {
    title: "Provide additional onboarding & training",
    priority: "Medium",
    difficulty: "Moderate",
    impact: "Strong",
    reasoning: "Login activity is well below your healthiest accounts — hands-on training re-establishes the habit that drives retention.",
  },
  "Low feature adoption": {
    title: "Run a feature adoption workshop",
    priority: "Medium",
    difficulty: "Moderate",
    impact: "Moderate",
    reasoning: "This account uses far fewer features than similar customers — showing them more value deepens their commitment.",
  },
  "Low spend": {
    title: "Offer a tailored upgrade path",
    priority: "Low",
    difficulty: "Easy",
    impact: "Moderate",
    reasoning: "Spend is in the lower band of your base — a targeted upgrade offer can lift both value and stickiness.",
  },
};

function buildFactors(
  sub: Record<string, number>,
  ctx: { days: number | null; supg?: { count: number; open: number }; customMetrics?: CustomMetricKey[] },
): Factor[] {
  const out: Factor[] = [];
  const push = (label: string, score: number, detail: string) =>
    out.push({ label, weight: Math.round(clamp(100 - score)), detail });

  if (sub["Days since last purchase"] != null && sub["Days since last purchase"] < 50 && ctx.days != null)
    push("No recent purchases", sub["Days since last purchase"], `Last purchase was ${Math.round(ctx.days)} days ago.`);
  if (sub["Resolution time"] != null && sub["Resolution time"] < 55 && ctx.supg && ctx.supg.open > 0)
    push("Unresolved support tickets", sub["Resolution time"], `${ctx.supg.open} of ${ctx.supg.count} tickets are open or reopened.`);
  if (sub["Support ticket volume"] != null && sub["Support ticket volume"] < 55 && ctx.supg)
    push("High support volume", sub["Support ticket volume"], `${ctx.supg.count} support ticket${ctx.supg.count === 1 ? "" : "s"} logged.`);
  if (sub["CSAT / NPS"] != null && sub["CSAT / NPS"] < 55)
    push("Declining satisfaction", sub["CSAT / NPS"], "Average satisfaction is tracking low across recent responses.");
  if (sub["Login frequency"] != null && sub["Login frequency"] < 50)
    push("Usage declining", sub["Login frequency"], "Login activity is well below your most active accounts.");
  if (sub["Feature adoption"] != null && sub["Feature adoption"] < 50)
    push("Low feature adoption", sub["Feature adoption"], "Using fewer features than your healthiest customers.");
  if (sub["Average order value"] != null && sub["Average order value"] < 40)
    push("Low spend", sub["Average order value"], "Average order value is in the lower range of your customer base.");

  // AI-suggested metrics: any that landed below the healthy band get surfaced
  // with the metric's own name so the customer drawer explains the drag.
  if (ctx.customMetrics) {
    for (const cm of ctx.customMetrics) {
      const s = sub[cm.metric.name];
      if (s != null && s < 50) {
        push(cm.metric.name, s, `Below the healthy range for ${cm.metric.name}.`);
      }
    }
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}


function segmentFor(monthly: number | null, segs: ProfileSegment[]): string {
  if (monthly != null) {
    for (const s of segs) {
      const mn = Number(s.min);
      const mx = Number(s.max);
      if (Number.isFinite(mn) && Number.isFinite(mx) && monthly >= mn && monthly <= mx) {
        return s.name || "Segment";
      }
    }
  }
  return "Unsegmented";
}

export function buildRealDataset(
  data: IngestedData,
  weights: MetricWeights,
  profile: OnboardingProfile | null,
): ScoredDataset {
  const customerRows = data.customers ?? [];
  const now = Date.now();
  const segs = profile?.segments ?? [];

  // ---- aggregate signals per customer ----
  const tx = new Map<string, { amounts: number[]; lastDate: number | null }>();
  for (const r of data.transactions ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = tx.get(id) ?? { amounts: [], lastDate: null };
    const a = num(r.amount);
    if (a != null) g.amounts.push(a);
    const d = parseDate(r.transaction_date);
    if (d != null) g.lastDate = Math.max(g.lastDate ?? 0, d);
    tx.set(id, g);
  }
  const sup = new Map<string, { count: number; open: number; sat: number[] }>();
  for (const r of data.support ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = sup.get(id) ?? { count: 0, open: 0, sat: [] };
    g.count++;
    const st = (r.status || "").toLowerCase();
    if (st.includes("open") || st.includes("reopen")) g.open++;
    const s = num(r.satisfaction_score);
    if (s != null) g.sat.push(s);
    sup.set(id, g);
  }
  const usg = new Map<string, { logins: number[]; features: number[] }>();
  for (const r of data.usage ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = usg.get(id) ?? { logins: [], features: [] };
    // Industry uploads commonly call a usage event a visit/check-in rather
    // than a login. Both are engagement-frequency signals.
    const l = num(r.logins) ?? num(r.check_in_count) ?? num(r.visit_count);
    if (l != null) g.logins.push(l);
    const f = num(r.features_used);
    if (f != null) g.features.push(f);
    usg.set(id, g);
  }
  const srv = new Map<string, number[]>();
  for (const r of data.surveys ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    // Survey templates vary by industry; satisfaction is the canonical CSAT
    // equivalent while motivation is a useful fallback for member check-ins.
    const s = num(r.score) ?? num(r.satisfaction_score) ?? num(r.motivation_score);
    const arr = srv.get(id) ?? [];
    if (s != null) arr.push(s);
    srv.set(id, arr);
  }

  // ---- AI-suggested custom metrics: latest value per customer ----
  // Each AI metric writes to a dataset key like `metric_<column>` with rows
  // { customer_id, date, <column> }. We keep the most recent value per
  // customer so the sub-score reflects the current state, not history.
  const customMetrics = customMetricKeys(profile?.metrics).filter(
    (cm) => !(METRIC_NAMES as readonly string[]).includes(cm.metric.name),
  );
  const customLatest = new Map<string, Map<string, number>>(); // metricName -> cid -> value
  const customMax = new Map<string, number>();
  const customMin = new Map<string, number>();
  for (const cm of customMetrics) {
    const rows = data[cm.key] ?? [];
    const latestTs = new Map<string, number>();
    const latestVal = new Map<string, number>();
    for (const r of rows) {
      const id = r.customer_id;
      if (!id) continue;
      const v = num(r[cm.column]);
      if (v == null) continue;
      const t = parseDate(r.date) ?? 0;
      const prev = latestTs.get(id);
      if (prev == null || t >= prev) {
        latestTs.set(id, t);
        latestVal.set(id, v);
      }
    }
    if (latestVal.size > 0) {
      customLatest.set(cm.metric.name, latestVal);
      const vals = [...latestVal.values()];
      customMax.set(cm.metric.name, Math.max(...vals));
      customMin.set(cm.metric.name, Math.min(...vals));
    }
  }

  // Normalize a raw metric value to 0–100 using the metric's own valueAt0 /
  // valueAt100 anchors (invert automatically when "lower is better"). Falls
  // back to relative scoring against the customer-base max when anchors are
  // missing.
  const customSubScore = (cm: CustomMetricKey, v: number): number => {
    const a0 = cm.metric.valueAt0;
    const a100 = cm.metric.valueAt100;
    if (a0 != null && a100 != null && a0 !== a100) {
      const pct = ((v - a0) / (a100 - a0)) * 100;
      return clamp(pct);
    }
    const mx = customMax.get(cm.metric.name) ?? 1;
    const mn = customMin.get(cm.metric.name) ?? 0;
    if (mx === mn) return 60;
    return clamp(((v - mn) / (mx - mn)) * 100);
  };

  // ---- reference maxima for relative scoring ----
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
    const scores = [...(srv.get(id) ?? []), ...((sup.get(id)?.sat) ?? [])];
    if (!scores.length) return null;
    const a = avg(scores)!;
    const mx = Math.max(...scores);
    if (mx <= 5) return clamp((a / 5) * 100);
    if (mx <= 10) return clamp((a / 10) * 100);
    return clamp(a);
  };

  // ---- score each customer ----
  const customers: Customer[] = customerRows.map((r, i) => {
    const cid = r.customer_id || "";
    const monthly = num(r.monthly_revenue) ?? num(r.monthly_fee);
    const txg = tx.get(cid);
    const revenue =
      monthly != null
        ? Math.round(monthly * 12)
        : txg
          ? Math.round(txg.amounts.reduce((s, x) => s + x, 0))
          : 0;

    const subScores: Record<string, number> = {};
    if (loginAvgByCust.has(cid)) subScores["Login frequency"] = clamp((loginAvgByCust.get(cid)! / maxLogin) * 100);
    if (featAvgByCust.has(cid)) subScores["Feature adoption"] = clamp((featAvgByCust.get(cid)! / maxFeat) * 100);
    const days = txg?.lastDate ? (now - txg.lastDate) / DAY : null;
    if (days != null) subScores["Days since last purchase"] = clamp(100 - (days / 180) * 100);
    if (aovByCust.has(cid)) subScores["Average order value"] = clamp((aovByCust.get(cid)! / maxAov) * 100);
    const supg = sup.get(cid);
    if (supg) {
      subScores["Support ticket volume"] = clamp(100 - (supg.count / maxTickets) * 100);
      subScores["Resolution time"] = clamp(100 - (supg.count ? (supg.open / supg.count) * 100 : 0));
    }
    const cs = csatScore(cid);
    if (cs != null) subScores["CSAT / NPS"] = cs;

    // AI-suggested custom metrics — one sub-score per metric this customer
    // has an uploaded value for.
    for (const cm of customMetrics) {
      const v = customLatest.get(cm.metric.name)?.get(cid);
      if (v != null) subScores[cm.metric.name] = customSubScore(cm, v);
    }

    let numr = 0;
    let den = 0;
    const scoredNames: string[] = [
      ...METRIC_NAMES,
      ...customMetrics.map((cm) => cm.metric.name),
    ];
    for (const m of scoredNames) {
      if (m in subScores) {
        const w = weights[m] ?? 1;
        if (w <= 0) continue;
        numr += subScores[m] * w;
        den += w;
      }
    }
    // No behavioural signal for this account → neutral "watch" rather than a
    // fabricated score.
    const health = den > 0 ? Math.round(numr / den) : 60;

    const cat = categoryFromHealth(health);
    const risk = Math.round(clamp(100 - health));
    const churnProbability = Math.round(clamp((100 - health) * 0.9 + (cat === "critical" ? 8 : 0), 3, 96));
    const sentiment = cs != null ? Math.round(cs) : Math.round(clamp(40 + health * 0.5));
    const lastTs = txg?.lastDate ?? parseDate(r.signup_date);
    const lastActivity = lastTs ? `${Math.max(0, Math.round((now - lastTs) / DAY))} days ago` : "—";

    const factors = buildFactors(subScores, { days, supg, customMetrics });
    const recommendations = factors
      .map((f) => {
        const base = REC_FOR[f.label];
        if (!base) return null;
        return { ...base, revenueSaved: Math.round((revenue * churnProbability) / 100 * 0.5) };
      })
      .filter((x): x is Recommendation => x !== null)
      .slice(0, 3);

    const timeline: TimelineEvent[] = [];
    if (r.signup_date && parseDate(r.signup_date))
      timeline.push({ date: r.signup_date.slice(0, 10), type: "signup", title: "Became a customer", detail: `${r.name || "This customer"} joined.` });
    if (txg?.lastDate)
      timeline.push({ date: new Date(txg.lastDate).toISOString().slice(0, 10), type: "purchase", title: "Most recent purchase", detail: `Latest transaction on record.` });
    if (supg && supg.count > 0)
      timeline.push({ date: new Date(now).toISOString().slice(0, 10), type: "support", title: "Support activity", detail: `${supg.count} ticket${supg.count === 1 ? "" : "s"} logged${supg.open ? `, ${supg.open} open` : ""}.` });
    timeline.push({
      date: new Date(now).toISOString().slice(0, 10),
      type: "score",
      title: health >= 55 ? "Account reviewed" : "Risk flagged",
      detail: `Health score ${health}, churn probability ${churnProbability}%.`,
    });
    timeline.sort((a, b) => a.date.localeCompare(b.date));

    return {
      id: cid || `cus_${i}`,
      name: r.name || cid || `Customer ${i + 1}`,
      contact: r.email || "",
      segment: segmentFor(monthly, segs),
      health,
      risk,
      churnProbability,
      revenue,
      sentiment,
      lastActivity,
      subScores,
      factors,
      recommendations,
      timeline,
    };
  });

  // ---- aggregate / executive metrics (same shape as the mock dataset) ----
  const sorted = [...customers].sort((a, b) => b.risk - a.risk);
  const counts = customers.reduce(
    (acc, c) => {
      acc[categoryFromHealth(c.health)] += 1;
      return acc;
    },
    { healthy: 0, watch: 0, "at-risk": 0, critical: 0 } as Record<RiskCategory, number>,
  );
  const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);
  const atRiskCustomers = customers.filter((c) => c.health < 55);
  const revenueAtRisk = atRiskCustomers.reduce(
    (s, c) => s + Math.round(c.revenue * (c.churnProbability / 100)),
    0,
  );
  const retentionOpportunity = atRiskCustomers.reduce((s, c) => {
    const exposure = c.revenue * (c.churnProbability / 100);
    const healthFactor = 0.4 + (Math.max(0, Math.min(c.health, 55)) / 55) * 0.5;
    const momentumFactor = 0.8 + (1 - c.churnProbability / 100) * 0.2;
    return s + Math.round(exposure * healthFactor * momentumFactor);
  }, 0);

  const segNames = [...new Set(customers.map((c) => c.segment))];

  return {
    customers,
    sortedByRisk: sorted,
    totalRevenue,
    revenueAtRisk,
    executive: {
      totalCustomers: customers.length,
      healthy: counts.healthy,
      watch: counts.watch,
      atRisk: counts["at-risk"],
      critical: counts.critical,
      predictedMonthlyChurn: Math.round(counts["at-risk"] * 0.4 + counts.critical * 0.7),
      predictedRevenueLoss: revenueAtRisk,
      revenueAtRisk,
      retentionOpportunity,
    },
    healthDistribution: [
      { name: "Healthy", value: counts.healthy, key: "healthy" as RiskCategory },
      { name: "Watch", value: counts.watch, key: "watch" as RiskCategory },
      { name: "At risk", value: counts["at-risk"], key: "at-risk" as RiskCategory },
      { name: "Critical", value: counts.critical, key: "critical" as RiskCategory },
    ],
    segmentRevenue: segNames.map((seg) => ({
      segment: seg,
      revenue: customers.filter((c) => c.segment === seg).reduce((s, c) => s + c.revenue, 0),
      atRisk: customers
        .filter((c) => c.segment === seg && c.health < 55)
        .reduce((s, c) => s + Math.round(c.revenue * (c.churnProbability / 100)), 0),
    })),
  };
}
