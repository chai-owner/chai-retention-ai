// Central mock data + helpers powering the ChAi demo experience.
// All numbers are illustrative sample data for a fictional company.

export type RiskCategory = "healthy" | "watch" | "at-risk" | "critical";

export const riskMeta: Record<
  RiskCategory,
  { label: string; tone: string; dot: string; text: string; chip: string }
> = {
  healthy: {
    label: "Healthy",
    tone: "success",
    dot: "bg-success",
    text: "text-success",
    chip: "bg-success/10 text-success border-success/20",
  },
  watch: {
    label: "Watch",
    tone: "warning",
    dot: "bg-warning",
    text: "text-warning",
    chip: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  "at-risk": {
    label: "At risk",
    tone: "caution",
    dot: "bg-caution",
    text: "text-caution",
    chip: "bg-caution/10 text-caution border-caution/20",
  },
  critical: {
    label: "Critical",
    tone: "danger",
    dot: "bg-danger",
    text: "text-danger",
    chip: "bg-danger/10 text-danger border-danger/20",
  },
};

export function categoryFromHealth(health: number): RiskCategory {
  if (health >= 75) return "healthy";
  if (health >= 55) return "watch";
  if (health >= 35) return "at-risk";
  return "critical";
}

export interface TimelineEvent {
  date: string;
  type: "signup" | "purchase" | "usage" | "support" | "conversation" | "survey" | "score";
  title: string;
  detail: string;
}

export interface Factor {
  label: string;
  weight: number; // 0-100 contribution to risk
  detail: string;
}

export interface Recommendation {
  title: string;
  priority: "High" | "Medium" | "Low";
  difficulty: "Easy" | "Moderate" | "Involved";
  impact: string;
  revenueSaved: number;
  reasoning: string;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  segment: string;
  health: number;
  risk: number;
  churnProbability: number;
  revenue: number;
  sentiment: number;
  lastActivity: string;
  subScores?: Record<string, number>;
  factors: Factor[];
  recommendations: Recommendation[];
  timeline: TimelineEvent[];
}

const firstNames = ["Acme", "Northwind", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Soylent", "Vandelay", "Pied Piper", "Wonka", "Cyberdyne", "Tyrell", "Gekko", "Oscorp", "Bluth", "Massive Dynamic"];
const suffixes = ["Labs", "Group", "Co", "Industries", "Studio", "Partners", "Digital", "Ventures"];
const segments = ["Enterprise", "Mid-Market", "SMB", "Startup"];

const factorPool: Factor[] = [
  { label: "Usage declining", weight: 32, detail: "Logins dropped 61% over the last 30 days versus their baseline." },
  { label: "No recent purchases", weight: 24, detail: "No transaction in 74 days — well past their usual 30-day cadence." },
  { label: "Unresolved support tickets", weight: 28, detail: "3 open tickets, 2 of them reopened after being marked resolved." },
  { label: "Negative sentiment detected", weight: 26, detail: "Recent messages express frustration about pricing and value." },
  { label: "Competitor mentioned", weight: 22, detail: "Customer referenced evaluating an alternative provider in a chat." },
  { label: "Below benchmark engagement", weight: 18, detail: "Feature adoption is 40% below the industry benchmark for SaaS." },
  { label: "Declining satisfaction", weight: 20, detail: "CSAT fell from 4.6 to 3.1 across the last three interactions." },
  { label: "Multiple escalations", weight: 23, detail: "2 escalations to a manager in the past two weeks." },
];

const recPool: Recommendation[] = [
  { title: "Schedule an executive review meeting", priority: "High", difficulty: "Moderate", impact: "Strong", revenueSaved: 0, reasoning: "Direct senior contact rebuilds trust when an account shows declining sentiment and competitor interest." },
  { title: "Resolve all open support issues", priority: "High", difficulty: "Easy", impact: "Strong", revenueSaved: 0, reasoning: "Unresolved tickets are the top churn driver here — closing them removes the most immediate frustration." },
  { title: "Offer a loyalty incentive", priority: "Medium", difficulty: "Easy", impact: "Moderate", revenueSaved: 0, reasoning: "A targeted discount or credit can offset pricing concerns long enough to demonstrate value." },
  { title: "Launch a re-engagement campaign", priority: "Medium", difficulty: "Moderate", impact: "Moderate", revenueSaved: 0, reasoning: "Usage has stalled — a guided campaign re-introduces the features tied to long-term retention." },
  { title: "Provide additional onboarding & training", priority: "Medium", difficulty: "Moderate", impact: "Strong", revenueSaved: 0, reasoning: "Low feature adoption suggests the team never fully onboarded — training lifts the value they perceive." },
  { title: "Customer success outreach call", priority: "High", difficulty: "Easy", impact: "Moderate", revenueSaved: 0, reasoning: "A proactive check-in surfaces problems before they become cancellation decisions." },
];

function seededRandom(seed: number) {
  // Scramble the seed so small, similar seeds don't produce similar streams.
  let s = (seed * 2654435761) % 2147483647;
  if (s <= 0) s += 2147483646;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  // Warm up to escape the low-value start region of the LCG.
  for (let i = 0; i < 12; i++) next();
  return next;
}

function buildTimeline(
  rand: () => number,
  name: string,
  cat: RiskCategory,
  factors: Factor[],
  health: number,
  churnProbability: number,
): TimelineEvent[] {
  const contract = 12000 + Math.round(rand() * 60) * 1000;
  const events: TimelineEvent[] = [
    { date: "2024-02-14", type: "signup", title: "Became a customer", detail: `${name} signed up for the Growth plan.` },
    { date: "2024-03-02", type: "purchase", title: "First purchase", detail: `Initial annual contract — $${contract.toLocaleString()}.` },
    { date: "2024-06-18", type: "usage", title: "Strong early adoption", detail: "Activated 4 of 5 core features. Health score peaked at 88." },
    { date: "2024-09-05", type: "survey", title: "Survey response", detail: "NPS of 9 — promoter. 'Great product, easy to use.'" },
  ];

  // Weave each detected risk factor into the history as a concrete event.
  const factorEventDates = ["2025-01-22", "2025-02-18", "2025-03-10", "2025-04-19", "2025-05-02"];
  factors.forEach((f, idx) => {
    const date = factorEventDates[idx % factorEventDates.length];
    const map: Record<string, TimelineEvent> = {
      "Usage declining": { date, type: "usage", title: "Usage started declining", detail: f.detail },
      "No recent purchases": { date, type: "purchase", title: "Buying activity stalled", detail: f.detail },
      "Unresolved support tickets": { date, type: "support", title: "Support tickets piling up", detail: f.detail },
      "Negative sentiment detected": { date, type: "conversation", title: "Negative sentiment in conversations", detail: f.detail },
      "Competitor mentioned": { date, type: "conversation", title: "Competitor evaluation mentioned", detail: f.detail },
      "Below benchmark engagement": { date, type: "usage", title: "Engagement fell below benchmark", detail: f.detail },
      "Declining satisfaction": { date, type: "survey", title: "Satisfaction scores dropped", detail: f.detail },
      "Multiple escalations": { date, type: "support", title: "Issues escalated to management", detail: f.detail },
    };
    events.push(map[f.label] ?? { date, type: "score", title: f.label, detail: f.detail });
  });

  if (cat === "healthy") {
    events.push({ date: "2025-05-21", type: "score", title: "Account is healthy", detail: `Health score steady at ${health}. Low churn risk (${churnProbability}%).` });
  } else {
    events.push({ date: "2025-05-21", type: "score", title: "Risk escalated", detail: `Churn probability rose to ${churnProbability}% — health score now ${health}.` });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Metric importance weights (set during onboarding) ----
// The eight core metrics the customer health score is built from. These match
// the Customer Intelligence Planner metric set.
export const METRIC_NAMES = [
  "Login frequency",
  "Feature adoption",
  "Days since last purchase",
  "Average order value",
  "Support ticket volume",
  "Resolution time",
  "CSAT / NPS",
  "Contract renewal date",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];
export type MetricWeights = Record<string, number>;

// Importance scale: 1 (Unimportant) → 5 (Critical).
export const IMPORTANCE_LABELS = ["Unimportant", "Low", "Moderate", "High", "Critical"];

// Sensible defaults used until the user sets their own importance in onboarding.
export const DEFAULT_METRIC_WEIGHTS: MetricWeights = {
  "Login frequency": 5,
  "Feature adoption": 4,
  "CSAT / NPS": 4,
  "Support ticket volume": 3,
  "Days since last purchase": 3,
  "Contract renewal date": 3,
  "Resolution time": 2,
  "Average order value": 2,
};

interface BaseCustomer {
  id: string;
  name: string;
  contact: string;
  segment: string;
  revenue: number;
  sentiment: number;
  lastActivity: string;
  subScores: Record<string, number>;
  seed: number;
}

// Per-customer raw metric sub-scores (0–100). The final health score is a
// weighted blend of these using the user's importance weights.
const baseCustomers: BaseCustomer[] = Array.from({ length: 42 }).map((_, i) => {
  const rand = seededRandom(i * 131 + 7);
  const name = `${firstNames[i % firstNames.length]} ${suffixes[(i * 3) % suffixes.length]}`;
  const subScores: Record<string, number> = {};
  for (const m of METRIC_NAMES) subScores[m] = Math.round(8 + rand() * 90);
  return {
    id: `cus_${(1000 + i).toString()}`,
    name,
    contact: `${["jordan", "casey", "morgan", "riley", "sam", "alex"][i % 6]}@${name.split(" ")[0].toLowerCase()}.com`,
    segment: segments[i % segments.length],
    revenue: Math.round((4 + rand() * 96) * 1000),
    sentiment: Math.round(20 + rand() * 75),
    lastActivity: `${Math.round(1 + rand() * 80)} days ago`,
    subScores,
    seed: i,
  };
});

// Weighted average of a customer's sub-scores using the importance weights.
export function weightedHealth(subScores: Record<string, number>, weights: MetricWeights): number {
  let num = 0;
  let den = 0;
  for (const m of METRIC_NAMES) {
    const w = weights[m] ?? 0;
    num += (subScores[m] ?? 50) * w;
    den += w;
  }
  return den > 0 ? Math.round(num / den) : 50;
}

// Produce the fully-scored customer list for a given set of importance weights.
export function scoreCustomers(weights: MetricWeights): Customer[] {
  return baseCustomers.map((b) => {
    const rand = seededRandom(b.seed * 97 + 13);
    const health = weightedHealth(b.subScores, weights);
    const cat = categoryFromHealth(health);
    const risk = Math.max(2, Math.min(99, Math.round(100 - health + (rand() * 12 - 6))));
    const churnProbability = Math.min(96, Math.max(3, Math.round((100 - health) * 0.9 + rand() * 10)));
    const nFactors = cat === "healthy" ? 1 : cat === "watch" ? 2 : 3;
    const factors = [...factorPool].sort(() => rand() - 0.5).slice(0, nFactors);
    const recommendations = [...recPool]
      .sort(() => rand() - 0.5)
      .slice(0, cat === "healthy" ? 1 : 3)
      .map((r) => ({ ...r, revenueSaved: Math.round(b.revenue * (0.2 + rand() * 0.5)) }));
    return {
      id: b.id,
      name: b.name,
      contact: b.contact,
      segment: b.segment,
      health,
      risk,
      churnProbability,
      revenue: b.revenue,
      sentiment: b.sentiment,
      lastActivity: b.lastActivity,
      subScores: b.subScores,
      factors,
      recommendations,
      timeline: buildTimeline(rand, b.name, cat, factors, health, churnProbability),
    };
  });
}

export interface ScoredDataset {
  customers: Customer[];
  sortedByRisk: Customer[];
  totalRevenue: number;
  revenueAtRisk: number;
  executive: {
    totalCustomers: number;
    healthy: number;
    watch: number;
    atRisk: number;
    critical: number;
    predictedMonthlyChurn: number;
    predictedRevenueLoss: number;
    revenueAtRisk: number;
    retentionOpportunity: number;
  };
  healthDistribution: { name: string; value: number; key: RiskCategory }[];
  segmentRevenue: { segment: string; revenue: number; atRisk: number }[];
}

// Build all aggregate / executive metrics from a scored customer list.
export function buildDataset(weights: MetricWeights): ScoredDataset {
  const scored = scoreCustomers(weights);
  const sorted = [...scored].sort((a, b) => b.risk - a.risk);
  const counts = scored.reduce(
    (acc, c) => {
      acc[categoryFromHealth(c.health)] += 1;
      return acc;
    },
    { healthy: 0, watch: 0, "at-risk": 0, critical: 0 } as Record<RiskCategory, number>,
  );
  const totalRevenue = scored.reduce((s, c) => s + c.revenue, 0);
  const revenueAtRisk = scored
    .filter((c) => c.health < 55)
    .reduce((s, c) => s + Math.round(c.revenue * (c.churnProbability / 100)), 0);

  return {
    customers: scored,
    sortedByRisk: sorted,
    totalRevenue,
    revenueAtRisk,
    executive: {
      totalCustomers: scored.length,
      healthy: counts.healthy,
      watch: counts.watch,
      atRisk: counts["at-risk"],
      critical: counts.critical,
      predictedMonthlyChurn: Math.round(counts["at-risk"] * 0.4 + counts.critical * 0.7),
      predictedRevenueLoss: revenueAtRisk,
      revenueAtRisk,
      retentionOpportunity: Math.round(revenueAtRisk * 0.62),
    },
    healthDistribution: [
      { name: "Healthy", value: counts.healthy, key: "healthy" as RiskCategory },
      { name: "Watch", value: counts.watch, key: "watch" as RiskCategory },
      { name: "At risk", value: counts["at-risk"], key: "at-risk" as RiskCategory },
      { name: "Critical", value: counts.critical, key: "critical" as RiskCategory },
    ],
    segmentRevenue: segments.map((seg) => ({
      segment: seg,
      revenue: scored.filter((c) => c.segment === seg).reduce((s, c) => s + c.revenue, 0),
      atRisk: scored
        .filter((c) => c.segment === seg && c.health < 55)
        .reduce((s, c) => s + Math.round(c.revenue * (c.churnProbability / 100)), 0),
    })),
  };
}

// Default (sensible-weights) dataset — used for SSR, loaders and any
// non-reactive consumers. Reactive views use the useScoredData() hook.
const defaultDataset = buildDataset(DEFAULT_METRIC_WEIGHTS);

export const customers = defaultDataset.customers;
export const sortedByRisk = defaultDataset.sortedByRisk;
export const totalRevenue = defaultDataset.totalRevenue;
export const revenueAtRisk = defaultDataset.revenueAtRisk;
export const executive = defaultDataset.executive;
export const healthDistribution = defaultDataset.healthDistribution;
export const segmentRevenue = defaultDataset.segmentRevenue;

export function getCustomer(id: string) {
  return customers.find((c) => c.id === id);
}

export const retentionTrend = [
  { month: "Dec", retention: 91, churn: 9 },
  { month: "Jan", retention: 90, churn: 10 },
  { month: "Feb", retention: 88, churn: 12 },
  { month: "Mar", retention: 89, churn: 11 },
  { month: "Apr", retention: 86, churn: 14 },
  { month: "May", retention: 87, churn: 13 },
];

// ---- Data readiness ----
export const dataReadiness = [
  { area: "Customer profiles", score: 90, note: "Most records have names, emails and signup dates." },
  { area: "Transactions", score: 80, note: "Purchase history is well populated." },
  { area: "Support data", score: 40, note: "Connect a support tool to unlock ticket signals." },
  { area: "Engagement data", score: 25, note: "We see almost no product-usage data yet." },
  { area: "Survey & CSAT", score: 35, note: "Only a few satisfaction scores are on file." },
  { area: "Retention history", score: 55, note: "Some cancellation dates are missing." },
];

export const readinessOverall = Math.round(
  dataReadiness.reduce((s, d) => s + d.score, 0) / dataReadiness.length,
);

// ---- Industry benchmarks ----
export const benchmarks = [
  { metric: "Annual churn rate", you: "13%", benchmark: "8%", status: "below" as const, note: "Your churn is higher than the SaaS average — there's clear room to improve." },
  { metric: "Net revenue retention", you: "104%", benchmark: "110%", status: "below" as const, note: "Healthy accounts are expanding, but not fast enough to fully offset losses." },
  { metric: "Support response time", you: "5.2h", benchmark: "6h", status: "above" as const, note: "You respond faster than most peers — a genuine strength." },
  { metric: "Avg. customer lifetime", you: "2.8 yrs", benchmark: "3.1 yrs", status: "at" as const, note: "Roughly in line with the industry." },
  { metric: "CSAT score", you: "4.1 / 5", benchmark: "4.3 / 5", status: "below" as const, note: "Satisfaction is slightly under the benchmark." },
  { metric: "Repeat purchase rate", you: "47%", benchmark: "42%", status: "above" as const, note: "More of your customers buy again than the typical company." },
];

// ---- Customer Intelligence Planner metrics ----
export const plannerMetrics = [
  { name: "Login frequency", why: "Tells you whether customers are getting into the product at all.", churn: "Customers who stop logging in churn far more often than active ones.", cadence: "Daily", benchmark: "3–5 logins / week", benchmarkScore: 70, category: "Engagement" },
  { name: "Feature adoption", why: "Shows whether customers reach the value they signed up for.", churn: "Low adoption is one of the strongest early warnings of churn.", cadence: "Weekly", benchmark: "≥ 60% of core features", benchmarkScore: 60, category: "Engagement" },
  { name: "Days since last purchase", why: "Measures buying momentum and lapse risk.", churn: "A gap longer than the usual cadence signals disengagement.", cadence: "Daily", benchmark: "< 30 days", benchmarkScore: 65, category: "Transactions" },
  { name: "Average order value", why: "Indicates account depth and spend trends.", churn: "Falling order value often precedes a downgrade or cancellation.", cadence: "Monthly", benchmark: "Trending flat or up", benchmarkScore: 60, category: "Transactions" },
  { name: "Support ticket volume", why: "Reveals friction in the customer experience.", churn: "A spike in tickets, especially unresolved ones, predicts churn.", cadence: "Weekly", benchmark: "< 2 open / customer", benchmarkScore: 65, category: "Support" },
  { name: "Resolution time", why: "How long customers wait for help.", churn: "Slow resolutions erode trust and raise cancellation risk.", cadence: "Weekly", benchmark: "< 24 hours", benchmarkScore: 60, category: "Support" },
  { name: "CSAT / NPS", why: "Direct measure of how customers feel.", churn: "Declining scores reliably lead the churn that follows.", cadence: "Per interaction", benchmark: "CSAT ≥ 4.3", benchmarkScore: 75, category: "Satisfaction" },
  { name: "Contract renewal date", why: "Marks the moments where churn actually happens.", churn: "Renewals concentrate risk into a single decision point.", cadence: "Monthly", benchmark: "90-day lead time", benchmarkScore: 70, category: "Retention" },
];

// ---- Integrations ----
export const integrations = [
  { name: "Zendesk", category: "Support", desc: "Sync tickets, status, categories and CSAT scores.", status: "available" },
  { name: "Intercom", category: "Support", desc: "Import conversations, chats and customer messages.", status: "available" },
  { name: "Freshdesk", category: "Support", desc: "Pull ticket history, resolution data and satisfaction.", status: "available" },
];

// ---- CRM integrations ----
export const crmIntegrations = [
  { name: "Salesforce", category: "CRM", desc: "Sync accounts, opportunities, renewal stages and owner activity.", status: "available" },
  { name: "HubSpot", category: "CRM", desc: "Import contacts, deals, lifecycle stages and engagement history.", status: "available" },
  { name: "Zoho CRM", category: "CRM", desc: "Pull accounts, deals, pipeline stages and contact touchpoints.", status: "available" },
];

// ---- Data quality findings ----
export const dataQuality = {
  reliability: 78,
  completeness: 64,
  findings: [
    { level: "warning", text: "18% of customer records are missing engagement data." },
    { level: "warning", text: "12% of records contain duplicate customer IDs." },
    { level: "info", text: "6% of signup dates are invalid or in the future." },
    { level: "info", text: "9% of records have no revenue value attached." },
  ],
};

export const fieldMappings = [
  { source: "company", target: "Customer Name", confidence: 98 },
  { source: "acct_id", target: "Customer ID", confidence: 95 },
  { source: "primary_email", target: "Email", confidence: 99 },
  { source: "mrr_usd", target: "Revenue", confidence: 91 },
  { source: "created", target: "Signup Date", confidence: 88 },
  { source: "last_order", target: "Last Purchase Date", confidence: 84 },
  { source: "last_seen", target: "Last Activity Date", confidence: 79 },
  { source: "plan_state", target: "Status", confidence: 72 },
];

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? "compact" : "standard",
  }).format(n);
}
