// Derives which datasets and fields the user should upload based on their
// onboarding answers (business model + how they defined success). Pure logic,
// no side effects — safe to run during render and on the server.
import { customerIdentifierFields, IDENTIFIER_HINT, type DatasetSchema, type SchemaField } from "@/lib/data-schemas";
import type { OnboardingProfile } from "@/lib/profile-store";
import type { PlannerMetric } from "@/lib/mock-data";

export interface PersonalizedField extends SchemaField {
  promoted?: boolean; // became required because of the profile
}

export interface PersonalizedDataset extends DatasetSchema {
  required: boolean;
  reasons: string[];
  fields: PersonalizedField[];
}

// Turn a metric name into a safe snake_case column name.
export function metricColumnName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "metric"
  );
}

// Compute the ingested-store dataset key + value column for each AI metric,
// mirroring the dedup logic in buildCustomMetricDatasets so scorers can find
// the rows the upload UI wrote.
export interface CustomMetricKey {
  metric: PlannerMetric;
  key: string;
  column: string;
}
export function customMetricKeys(metrics: PlannerMetric[] | undefined): CustomMetricKey[] {
  if (!metrics || metrics.length === 0) return [];
  const usedKeys = new Set<string>();
  const usedCols = new Set<string>();
  const out: CustomMetricKey[] = [];
  for (const m of metrics) {
    const base = metricColumnName(m.name);
    let col = base;
    let i = 2;
    while (usedCols.has(col)) col = `${base}_${i++}`;
    usedCols.add(col);
    let key = `metric_${col}`;
    let j = 2;
    while (usedKeys.has(key)) key = `metric_${col}_${j++}`;
    usedKeys.add(key);
    out.push({ metric: m, key, column: col });
  }
  return out;
}


// Build one synthetic dataset per AI-picked metric, so each shows up as its
// own option in the upload dropdown. Each dataset has customer_id, date, and
// a single value column named after the metric.
export function buildCustomMetricDatasets(
  metrics: PlannerMetric[] | undefined,
): DatasetSchema[] {
  if (!metrics || metrics.length === 0) return [];
  const usedKeys = new Set<string>();
  const usedCols = new Set<string>();
  const out: DatasetSchema[] = [];
  for (const m of metrics) {
    const base = metricColumnName(m.name);
    let col = base;
    let i = 2;
    while (usedCols.has(col)) col = `${base}_${i++}`;
    usedCols.add(col);
    let key = `metric_${col}`;
    let j = 2;
    while (usedKeys.has(key)) key = `metric_${col}_${j++}`;
    usedKeys.add(key);

    const a0 = m.valueAt0 ?? 0;
    const a100 = m.valueAt100 ?? 100;
    const mid = a0 + (a100 - a0) * 0.6;
    const sample = `${m.prefix ?? ""}${mid.toFixed(m.decimals ?? 0)}`;
    const unitSuffix = m.unit ? ` (${m.unit.trim()})` : "";

    out.push({
      key,
      label: `${m.name}${unitSuffix}`,
      description:
        (m.why || m.churn || `Values for ${m.name} — one of the retention metrics ChAi picked for your business during onboarding.`) +
        ` One row per customer per measurement date. ${IDENTIFIER_HINT}`,
      fields: [
        ...customerIdentifierFields(),
        { name: "date", mandatory: true, description: "When the metric was measured (YYYY-MM-DD)", example: "2025-05-20" },
        {
          name: col,
          mandatory: true,
          description: `${m.name}${unitSuffix} — ${m.why || m.churn || m.category}`,
          example: sample,
        },
      ],
      sampleRows: [
        ["CUS-1001", "ops@northwind.com", "Northwind Labs", "2025-05-20", sample],
        ["", "team@globex.com", "Globex Co", "2025-05-20", sample],
      ],
    });
  }
  return out;
}

// Which dataset each business model leans on most, plus the fields that matter.
const MODEL_RULES: Record<
  string,
  { dataset: string; fields: string[]; reason: string }
> = {
  SaaS: { dataset: "usage", fields: ["logins", "features_used"], reason: "SaaS retention lives or dies on product engagement, so usage data is essential." },
  Subscription: { dataset: "usage", fields: ["logins", "active_minutes"], reason: "Subscription health depends on ongoing engagement, so usage data is essential." },
  Membership: { dataset: "usage", fields: ["logins", "active_minutes"], reason: "Membership retention depends on members staying active, so usage data is essential." },
  "Fitness / Gym": { dataset: "usage", fields: ["logins", "active_minutes"], reason: "Attendance and activity drive renewals, so usage data is essential." },
  Education: { dataset: "usage", fields: ["logins", "features_used"], reason: "Progress and attendance signals matter most, so usage data is essential." },
  Ecommerce: { dataset: "transactions", fields: ["amount", "transaction_date", "product"], reason: "Repeat-purchase behaviour is your core retention signal, so transactions are essential." },
  Marketplace: { dataset: "transactions", fields: ["amount", "transaction_date"], reason: "Repeat activity on both sides is key, so transactions are essential." },
  Insurance: { dataset: "transactions", fields: ["amount", "transaction_date"], reason: "Policy renewals and premiums are your retention signal, so transactions are essential." },
  Telecom: { dataset: "transactions", fields: ["amount", "transaction_date"], reason: "Contract renewals and usage tiers matter, so transactions are essential." },
  "Financial Services": { dataset: "transactions", fields: ["amount", "transaction_date"], reason: "Account activity and renewals are your retention signal, so transactions are essential." },
};

// Keyword → dataset rules applied to the free-text "success" answers.
const SUCCESS_RULES: { keywords: string[]; dataset: string; reason: string }[] = [
  { keywords: ["renew", "purchase", "buy", "order", "repeat", "upsell", "expand"], dataset: "transactions", reason: "You described success in terms of purchases or renewals — upload transactions so ChAi can track them." },
  { keywords: ["login", "log in", "engage", "active", "adopt", "feature", "usage", "attend"], dataset: "usage", reason: "You described success in terms of engagement — upload product usage so ChAi can measure it." },
  { keywords: ["satisf", "nps", "csat", "survey", "feedback", "happy", "recommend"], dataset: "surveys", reason: "You mentioned satisfaction signals — upload surveys & CSAT so ChAi can track sentiment." },
  { keywords: ["support", "ticket", "complaint", "issue", "respond", "help"], dataset: "support", reason: "You mentioned support signals — upload support tickets so ChAi can spot frustration early." },
];

export function personalizeDatasets(
  profile: OnboardingProfile | null,
  schemas: DatasetSchema[],
): PersonalizedDataset[] {
  // Accumulate required datasets and reasons by key.
  const required = new Set<string>(["customers"]);
  const reasons: Record<string, string[]> = {
    customers: ["Your core customer list is the foundation for everything ChAi does."],
  };
  const promotedFields: Record<string, Set<string>> = {};

  const addReason = (key: string, reason: string) => {
    (reasons[key] ??= []).push(reason);
  };
  const promote = (key: string, fields: string[]) => {
    promotedFields[key] ??= new Set();
    fields.forEach((f) => promotedFields[key].add(f));
  };

  if (profile) {
    // Metrics ChAi nominated (and the user kept with a non-zero weight) drive
    // the health score, so their uploads are required. Weight 0 = removed.
    for (const { metric, key } of customMetricKeys(profile.metrics)) {
      const weight = profile.metricWeights?.[metric.name] ?? metric.weight ?? 3;
      if (weight > 0) {
        required.add(key);
        addReason(
          key,
          `ChAi picked "${metric.name}" as a retention metric for your business, and it feeds your customer health score.`,
        );
      }
    }


    // Business model rule.
    const modelRule = MODEL_RULES[profile.model];
    if (modelRule) {
      required.add(modelRule.dataset);
      addReason(modelRule.dataset, modelRule.reason);
      promote(modelRule.dataset, modelRule.fields);
    }

    // Success-definition rules (scan free text + toggled tracking questions).
    const haystack = [
      profile.successActions,
      profile.disengagement,
      ...Object.entries(profile.tracked ?? {})
        .filter(([, on]) => on)
        .map(([q]) => q),
    ]
      .join(" ")
      .toLowerCase();

    for (const rule of SUCCESS_RULES) {
      if (rule.keywords.some((k) => haystack.includes(k))) {
        required.add(rule.dataset);
        addReason(rule.dataset, rule.reason);
      }
    }
  }

  return schemas.map((schema) => {
    const isRequired = required.has(schema.key);
    const promoted = promotedFields[schema.key];
    return {
      ...schema,
      required: isRequired,
      reasons: reasons[schema.key] ?? [],
      fields: schema.fields.map((f) => {
        const isPromoted = !!promoted?.has(f.name) && !f.mandatory;
        return { ...f, mandatory: f.mandatory || isPromoted, promoted: isPromoted };
      }),
    };
  });
}
