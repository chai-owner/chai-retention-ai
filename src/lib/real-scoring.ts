// True per-customer risk scoring computed from the rows the user actually
// uploaded or synced (see ingested-data-store.ts). No demo data is involved:
// if a signal is absent for a customer, that metric is simply excluded from
// their weighted health score rather than being invented.
import { withCountableTransactions, dealOnlyCustomers, MIN_DEAL_PEERS } from "@/lib/countable-transactions";
import {
  type Customer,
  type ScoredDataset,
  type RiskCategory,
  type Factor,
  type Recommendation,
  type TimelineEvent,
  categoryFromHealth,
  METRIC_NAMES,
  type PlannerMetric,
  type MetricWeights,
} from "@/lib/mock-data";
import type { OnboardingProfile, ProfileSegment } from "@/lib/profile-store";
import type { IngestedData } from "@/lib/ingested-data-store";
import { customMetricKeys, type CustomMetricKey } from "@/lib/personalize-data";
import { resolveMetric } from "@/lib/metric-resolution";
import { playbookFor } from "@/lib/metric-playbooks";
import {
  blendScore,
  compareRhythm,
  compareTrend,
  describeComparison,
  type PersonalComparison,
  type SeriesPoint,
} from "@/lib/personal-baseline";
import {
  churnConfidenceFor,
  churnProbabilityFromHealth,
  dataSourceFor,
  type ChurnConfidence,
} from "@/lib/churn-probability";


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

export function assessSufficiency(data: IngestedData, metrics?: PlannerMetric[] | null): Sufficiency {
  const customerCount = (data.customers ?? []).length;
  const transactionCount = (data.transactions ?? []).length;
  const supportCount = (data.support ?? []).length;
  const usageCount = (data.usage ?? []).length;
  const surveyCount = (data.surveys ?? []).length;
  const standardSignals = [transactionCount, supportCount, usageCount, surveyCount].filter((n) => n > 0).length;
  const resolvedMetricDatasets = new Set(
    (metrics ?? [])
      .map((metric) => resolveMetric(metric, data))
      .filter((resolved) => resolved.values.size > 0 && resolved.dataset)
      .map((resolved) => resolved.dataset as string),
  );
  const signalDatasets = Math.max(standardSignals, resolvedMetricDatasets.size);
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
    steps: [
      "Call or message this customer within 48 hours with a specific reason to return — a booked appointment, reserved slot or held offer.",
      "Send a time-boxed win-back incentive tied to a deadline rather than an open-ended discount.",
      "If there is no response in 7 days, escalate to a personal call from the owner or account lead.",
    ],
  },
  "High support volume": {
    title: "Resolve open support issues",
    priority: "High",
    difficulty: "Easy",
    impact: "Strong",
    reasoning: "A spike in tickets is a leading churn signal. Closing them removes the most immediate source of frustration.",
    steps: [
      "Assign one named owner to this account and consolidate every open issue into a single thread.",
      "Give the customer a written summary of what is being fixed and by when.",
      "Review the ticket themes for a root cause and fix it so the volume does not return.",
    ],
  },
  "Unresolved support tickets": {
    title: "Clear the open ticket backlog",
    priority: "High",
    difficulty: "Easy",
    impact: "Strong",
    reasoning: "Open and reopened tickets are the top churn driver here — resolving them rebuilds confidence fast.",
    steps: [
      "Resolve or formally answer every open ticket on this account today, oldest first.",
      "Send one recap message confirming each item is closed and what changed.",
      "Follow up 7 days later to confirm nothing reopened.",
    ],
  },
  "Declining satisfaction": {
    title: "Schedule an executive check-in",
    priority: "High",
    difficulty: "Moderate",
    impact: "Strong",
    reasoning: "Low satisfaction scores mean trust is eroding — direct senior contact is the fastest way to reset the relationship.",
    steps: [
      "Have an owner or manager call within 72 hours and ask what single change would make the biggest difference.",
      "Fix or answer the specific issue they name, then tell them what you did.",
      "Re-survey in 30 days to confirm the score recovered.",
    ],
  },
  "Usage declining": {
    title: "Provide additional onboarding & training",
    priority: "Medium",
    difficulty: "Moderate",
    impact: "Strong",
    reasoning: "Login activity is well below your healthiest accounts — hands-on training re-establishes the habit that drives retention.",
    steps: [
      "Book a 20-minute guided session focused on the one outcome they signed up for.",
      "Set up or complete one thing for them live so they leave with a result.",
      "Check usage weekly for a month and intervene again if it stays flat.",
    ],
  },
  "Low feature adoption": {
    title: "Run a feature adoption workshop",
    priority: "Medium",
    difficulty: "Moderate",
    impact: "Moderate",
    reasoning: "This account uses far fewer features than similar customers — showing them more value deepens their commitment.",
    steps: [
      "Show the two capabilities most used by your healthiest accounts, applied to this customer's own data or goals.",
      "Configure one of them with them during the session instead of sending documentation.",
      "Follow up in two weeks to confirm they are still using it.",
    ],
  },
  "Low spend": {
    title: "Offer a tailored upgrade path",
    priority: "Low",
    difficulty: "Easy",
    impact: "Moderate",
    reasoning: "Spend is in the lower band of your base — a targeted upgrade offer can lift both value and stickiness.",
    steps: [
      "Review what they actually use and propose the single plan or add-on that matches it.",
      "Offer a short, time-boxed trial of that upgrade so there is no commitment risk.",
      "If budget is the blocker, offer an annual or off-peak rate rather than discounting.",
    ],
  },
};

function buildFactors(
  sub: Record<string, number>,
  ctx: {
    days: number | null;
    supg?: { count: number; open: number };
    customMetrics?: CustomMetricKey[];
    /** Personal-comparison reason per sub-score label; replaces the generic detail. */
    notes?: Record<string, string>;
  },
): Factor[] {
  const out: Factor[] = [];
  const subKey: Record<string, string> = {
    "No recent purchases": "Days since last purchase",
    "Unresolved support tickets": "Resolution time",
    "High support volume": "Support ticket volume",
    "Declining satisfaction": "CSAT / NPS",
    "Usage declining": "Login frequency",
    "Low feature adoption": "Feature adoption",
    "Low spend": "Average order value",
  };
  const push = (label: string, score: number, detail: string) =>
    out.push({ label, weight: Math.round(clamp(100 - score)), detail: ctx.notes?.[subKey[label] ?? label] ?? detail });

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
  rawData: IngestedData,
  weights: MetricWeights,
  profile: OnboardingProfile | null,
): ScoredDataset {
  // Open and lost CRM deals are not sales.
  const data = withCountableTransactions(rawData);
  // Customers whose only sales data is CRM deals (see countable-transactions).
  const dealOnly = dealOnlyCustomers(data);
  const dealPeersOk = dealOnly.size >= MIN_DEAL_PEERS;
  const customerRows = data.customers ?? [];
  const now = Date.now();
  const segs = profile?.segments ?? [];

  // ---- aggregate signals per customer ----
  const tx = new Map<string, { amounts: number[]; lastDate: number | null; dates: number[]; dated: SeriesPoint[] }>();
  for (const r of data.transactions ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = tx.get(id) ?? { amounts: [], lastDate: null, dates: [], dated: [] };
    const a = num(r.amount);
    if (a != null) g.amounts.push(a);
    const d = parseDate(r.transaction_date);
    if (d != null) {
      g.lastDate = Math.max(g.lastDate ?? 0, d);
      g.dates.push(d);
      if (a != null) g.dated.push({ date: d, value: a });
    }
    tx.set(id, g);
  }
  const sup = new Map<string, { count: number; open: number; sat: number[]; dated: SeriesPoint[] }>();
  for (const r of data.support ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = sup.get(id) ?? { count: 0, open: 0, sat: [], dated: [] };
    g.count++;
    const td = parseDate(r.created_at) ?? parseDate(r.date) ?? parseDate(r.opened_at) ?? parseDate(r.occurred_at);
    if (td != null) g.dated.push({ date: td, value: 1 });
    const st = (r.status || "").toLowerCase();
    if (st.includes("open") || st.includes("reopen")) g.open++;
    const s = num(r.satisfaction_score);
    if (s != null) g.sat.push(s);
    sup.set(id, g);
  }
  const usg = new Map<string, { logins: number[]; features: number[]; dated: SeriesPoint[] }>();
  for (const r of data.usage ?? []) {
    const id = r.customer_id;
    if (!id) continue;
    const g = usg.get(id) ?? { logins: [], features: [], dated: [] };
    // Industry uploads commonly call a usage event a visit/check-in rather
    // than a login. Both are engagement-frequency signals.
    const l = num(r.logins) ?? num(r.check_in_count) ?? num(r.visit_count);
    if (l != null) {
      g.logins.push(l);
      const ud = parseDate(r.date) ?? parseDate(r.activity_date) ?? parseDate(r.visit_date) ?? parseDate(r.occurred_at);
      if (ud != null) g.dated.push({ date: ud, value: l });
    }
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

  // Generated metrics can come from their dedicated metric upload OR resolve
  // from semantically matching fields in customers, usage, transactions,
  // surveys, or support. This lets raw operational data power the assessment
  // without requiring users to re-upload the same values per metric.
  const customMetrics = customMetricKeys(profile?.metrics).filter(
    (cm) => !(METRIC_NAMES as readonly string[]).includes(cm.metric.name),
  );
  const customLatest = new Map<string, Map<string, number>>();
  const customDataset = new Map<string, string | null>();
  const customMax = new Map<string, number>();
  const customMin = new Map<string, number>();
  const customResolved = new Map<string, ReturnType<typeof resolveMetric>>();
  // Spend / order-size measures on sales data: deal-only customers get their
  // own range (and none at all below MIN_DEAL_PEERS).
  const customSplit = new Set<string>();
  const customDealRange = new Map<string, { min: number; max: number }>();
  const peerTarget = new Map<string, number>();
  for (const cm of customMetrics) {
    const resolved = resolveMetric(cm.metric, data, now);
    if (resolved.values.size > 0) {
      customLatest.set(cm.metric.name, resolved.values);
      customDataset.set(cm.metric.name, resolved.dataset ?? null);
      customResolved.set(cm.metric.name, resolved);
      const op = resolved.operation;
      const split =
        dataSourceFor(resolved.dataset) === "transactions" &&
        op !== "days_since_last" && op !== "months_since" && dealOnly.size > 0;
      const entries = [...resolved.values.entries()];
      const vals = (split ? entries.filter(([id]) => !dealOnly.has(id)) : entries).map(([, v]) => v);
      if (split) {
        customSplit.add(cm.metric.name);
        const dv = entries.filter(([id]) => dealOnly.has(id)).map(([, v]) => v);
        if (dv.length) customDealRange.set(cm.metric.name, { min: Math.min(...dv), max: Math.max(...dv) });
      }
      if (!vals.length) vals.push(...entries.map(([, v]) => v));
      customMax.set(cm.metric.name, Math.max(...vals));
      customMin.set(cm.metric.name, Math.min(...vals));
      // Peer target = what a healthy customer looks like on this metric
      // (75th percentile, or 25th when lower is better) so recommendations can
      // name a concrete goal instead of "improve this".
      const sorted = [...vals].sort((a, b) => a - b);
      const lowerBetter =
        cm.metric.valueAt0 != null &&
        cm.metric.valueAt100 != null &&
        cm.metric.valueAt0 > cm.metric.valueAt100;
      const idx = Math.floor((sorted.length - 1) * (lowerBetter ? 0.25 : 0.75));
      peerTarget.set(cm.metric.name, sorted[idx]);
    }
  }

  // Normalize a raw metric value to 0–100 using the metric's own valueAt0 /
  // valueAt100 anchors (invert automatically when "lower is better"). Falls
  // back to relative scoring against the customer-base max when anchors are
  // missing.
  const customSubScore = (cm: CustomMetricKey, v: number, cid: string): number => {
    const a0 = cm.metric.valueAt0;
    const a100 = cm.metric.valueAt100;
    if (a0 != null && a100 != null && a0 !== a100) {
      const pct = ((v - a0) / (a100 - a0)) * 100;
      return clamp(pct);
    }
    const dealRange = customSplit.has(cm.metric.name) && dealOnly.has(cid) ? customDealRange.get(cm.metric.name) : null;
    const mx = dealRange?.max ?? customMax.get(cm.metric.name) ?? 1;
    const mn = dealRange?.min ?? customMin.get(cm.metric.name) ?? 0;
    if (mx === mn) return 60;
    return clamp(((v - mn) / (mx - mn)) * 100);
  };

  // ---- reference maxima for relative scoring ----
  // Deal sizes and invoice sizes are different kinds of number: deal-only
  // customers are compared only with each other, and only when there are
  // enough of them (MIN_DEAL_PEERS); otherwise they get no order-value score.
  const aovByCust = new Map<string, number>();
  for (const [id, g] of tx) {
    if (dealOnly.has(id) && !dealPeersOk) continue;
    const a = avg(g.amounts);
    if (a != null) aovByCust.set(id, a);
  }
  const maxAovDeals = Math.max(1, ...[...aovByCust].filter(([id]) => dealOnly.has(id)).map(([, v]) => v));
  const maxAovInvoices = Math.max(1, ...[...aovByCust].filter(([id]) => !dealOnly.has(id)).map(([, v]) => v));
  const loginAvgByCust = new Map<string, number>();
  const featAvgByCust = new Map<string, number>();
  for (const [id, g] of usg) {
    const la = avg(g.logins);
    if (la != null) loginAvgByCust.set(id, la);
    const fa = avg(g.features);
    if (fa != null) featAvgByCust.set(id, fa);
  }
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
    const metricValues: Record<string, number> = {};
    // Reason text for signals judged against this customer's own history.
    const personalNotes: Record<string, string> = {};
    // Compare to the customer's own history where there is enough of it;
    // otherwise keep the cross-customer / fixed-window score (blended while thin).
    const personalise = (label: string, fallback: number, personal: PersonalComparison | null, what: string) => {
      const b = blendScore(personal, fallback);
      subScores[label] = b.score;
      const note = describeComparison(personal, b.basis, what);
      if (note) personalNotes[label] = note;
    };
    const usgg = usg.get(cid);
    if (loginAvgByCust.has(cid))
      personalise("Login frequency", clamp((loginAvgByCust.get(cid)! / maxLogin) * 100), compareTrend(usgg?.dated, "average", "higher", now), "activity per record");
    if (featAvgByCust.has(cid)) subScores["Feature adoption"] = clamp((featAvgByCust.get(cid)! / maxFeat) * 100);
    const days = txg?.lastDate ? (now - txg.lastDate) / DAY : null;
    if (days != null)
      personalise("Days since last purchase", clamp(100 - (days / 180) * 100), compareRhythm(txg?.dates, now), "purchase");
    if (aovByCust.has(cid))
      personalise("Average order value", clamp((aovByCust.get(cid)! / (dealOnly.has(cid) ? maxAovDeals : maxAovInvoices)) * 100), compareTrend(txg?.dated, "average", "higher", now), "average order value");
    const supg = sup.get(cid);
    if (supg) {
      personalise("Support ticket volume", clamp(100 - (supg.count / maxTickets) * 100), compareTrend(supg.dated, "sum", "lower", now), "support tickets");
      subScores["Resolution time"] = clamp(100 - (supg.count ? (supg.open / supg.count) * 100 : 0));
    }
    const cs = csatScore(cid);
    if (cs != null) subScores["CSAT / NPS"] = cs;

    // AI-suggested custom metrics — one sub-score per metric this customer
    // has an uploaded value for.
    for (const cm of customMetrics) {
      const v = customLatest.get(cm.metric.name)?.get(cid);
      const dealSkip = customSplit.has(cm.metric.name) && dealOnly.has(cid) && !dealPeersOk;
      if (v != null && !dealSkip) {
        metricValues[cm.metric.name] = v;
        const res = customResolved.get(cm.metric.name);
        const pts = res?.series?.get(cid);
        const lowerBetter =
          cm.metric.valueAt0 != null && cm.metric.valueAt100 != null && cm.metric.valueAt0 > cm.metric.valueAt100;
        const op = res?.operation;
        const personal =
          op === "days_since_last"
            ? compareRhythm(pts?.map((p) => p.date), now)
            : op === "average" || op === "sum" || op === "ratio"
              ? compareTrend(pts, op, lowerBetter ? "lower" : "higher", now)
              : null;
        const what =
          op === "days_since_last"
            ? (cm.metric.name.match(/since\s+(?:the\s+)?(?:last|most recent)\s+(.+)$/i)?.[1] ?? "recorded activity").toLowerCase()
            : cm.metric.name.toLowerCase();
        personalise(cm.metric.name, customSubScore(cm, v, cid), personal, what);
      }
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
    const churnProbability = churnProbabilityFromHealth(health);
    // Confidence reflects data completeness: how many distinct data categories
    // this customer actually has signals in.
    // Counts distinct data SOURCES, not metric labels: ticket volume and
    // ticket satisfaction are both "support"; satisfaction only counts as its
    // own source when it comes from survey data.
    const dataCategories = new Set<string>();
    if (txg) dataCategories.add("transactions");
    if (loginAvgByCust.has(cid) || featAvgByCust.has(cid)) dataCategories.add("usage");
    if (supg) dataCategories.add("support");
    if ((srv.get(cid)?.length ?? 0) > 0) dataCategories.add("surveys");
    for (const cm of customMetrics) {
      if (customLatest.get(cm.metric.name)?.get(cid) != null) {
        const src = dataSourceFor(customDataset.get(cm.metric.name));
        if (src) dataCategories.add(src);
      }
    }
    const churnConfidence: ChurnConfidence = churnConfidenceFor(dataCategories.size);
    const sentiment = cs != null ? Math.round(cs) : Math.round(clamp(40 + health * 0.5));
    const lastTs = txg?.lastDate ?? parseDate(r.signup_date);
    const lastActivity = lastTs ? `${Math.max(0, Math.round((now - lastTs) / DAY))} days ago` : "—";

    const factors = buildFactors(subScores, { days, supg, customMetrics, notes: personalNotes });
    const recommendations = factors
      .map((f) => {
        // Known churn drivers have hand-written playbooks; anything else
        // (e.g. an AI-suggested metric) gets a semantic playbook built from the
        // metric's meaning, the customer's real value and a peer target — so
        // the action is always something the owner can actually do.
        const cm = customMetrics.find((c) => c.metric.name === f.label);
        const base: Omit<Recommendation, "revenueSaved"> =
          REC_FOR[f.label] ??
          playbookFor({
            metric: f.label,
            detail: f.detail,
            weight: f.weight,
            customerName: r.name || "this customer",
            value: metricValues[f.label] ?? null,
            target: peerTarget.get(f.label) ?? null,
            unit: cm?.metric.unit,
            lowerIsBetter:
              cm?.metric.valueAt0 != null &&
              cm?.metric.valueAt100 != null &&
              cm.metric.valueAt0 > cm.metric.valueAt100,
          });
        return { ...base, revenueSaved: Math.round((revenue * churnProbability) / 100 * 0.5) };
      })
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
      churnConfidence,
      dataCategories: dataCategories.size,
      revenue,
      sentiment,
      lastActivity,
      subScores,
      metricValues,
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
