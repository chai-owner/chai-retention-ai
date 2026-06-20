// Derives which datasets and fields the user should upload based on their
// onboarding answers (business model + how they defined success). Pure logic,
// no side effects — safe to run during render and on the server.
import type { DatasetSchema, SchemaField } from "@/lib/data-schemas";
import type { OnboardingProfile } from "@/lib/profile-store";

export interface PersonalizedField extends SchemaField {
  promoted?: boolean; // became required because of the profile
}

export interface PersonalizedDataset extends DatasetSchema {
  required: boolean;
  reasons: string[];
  fields: PersonalizedField[];
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
