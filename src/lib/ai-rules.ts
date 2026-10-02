// Shared rules for every AI prompt that writes customer-facing text (Ask ChAi,
// dashboard tips, daily brief headline, welcome insights). Client-safe so the
// same rules can be unit-tested and reused by server modules.
import { currencySymbol, formatMoney, normalizeDataCurrency, type DataCurrency } from "@/lib/money";

export const AI_FACT_RULES = `FACTS: use only numbers that appear in the data given to you. Never invent or estimate figures, revenue, percentages or counts. Never call a customer "high-revenue", "low-revenue", "big", "small" or "valuable" — revenue judgements are not allowed. If a number isn't given, leave it out.`;

export const AI_FEATURE_RULES = `FEATURES: only mention things ChAi actually has:
- Today page: a daily brief of what needs attention.
- Dashboard: overall health, at-risk count and revenue at risk.
- Customer Risk Center: every customer ranked riskiest first, with health, churn risk and the reasons behind it; open a customer for their profile.
- Churned & Win-back: customers who have left.
- Data Quality: gaps and stale data to fix.
- Identity Resolution: link the same customer across different tools.
- Insights & Benchmarks: patterns across groups of customers.
- Data Uploads & Integrations: connect QuickBooks, Xero, FreshBooks, Zendesk, Intercom, Zoho, HubSpot or upload files.
- Business Profile: tell ChAi about the business.
ChAi does NOT send emails, create tasks, set alerts, run surveys, automate check-ins or trigger actions at a score threshold. Never say "automated" or "automatic". When a useful action needs something ChAi doesn't do, phrase it as something the user does themselves (e.g. "Call Northstar Legal this week"), never as a ChAi setting.`;

/** Currency instruction shared by every prompt that sees money. */
export function currencyRule(currency: unknown): string {
  const c = normalizeDataCurrency(currency);
  const sym = currencySymbol(c);
  return `CURRENCY: all amounts are in ${c}. Write money with "${sym}" exactly as given (e.g. ${formatMoney(12500, c)}); never use another currency symbol or code, never convert, and never add amounts in different currencies together.`;
}

const BANNED = [
  /\bautomat(ed|ic|ically|e)\b/i,
  /\b(high|low)[- ]revenue\b/i,
  /\bchai (will|can|could) (send|email|alert|notify|remind|trigger|survey)/i,
  /\b(set up|create|schedule|trigger|configure) (an? )?(alert|trigger|survey|email campaign|drip)/i,
  /\bsend (an? )?(check-in )?(email|survey)s? (from|via|through|in) chai/i,
];

/**
 * Safety net applied after the model answers: returns null when a tip breaks a
 * shared rule (ChAi-sent automation, revenue labels, a foreign currency) so the
 * card simply shows no tip instead of a misleading one.
 */
export function sanitizeAiTip(text: unknown, currency: DataCurrency | string | undefined): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (BANNED.some((re) => re.test(t))) return null;
  const c = normalizeDataCurrency(currency);
  // Foreign currency symbols/codes.
  const foreign = c === "ZAR" ? /\$|US\$|\bUSD\b|€|£/ : /\bR\s?\d|\bZAR\b|€|£/;
  if (foreign.test(t)) return null;
  return t;
}

export interface RiskTipCustomer {
  id: string;
  name: string;
  churnProbability: number;
  revenue: number;
  health: number;
  factors: string[];
}

/** Prompt for the dashboard "Needs attention now" one-line tips. */
export function buildRiskTipPrompt(customers: RiskTipCustomer[], currency: unknown): string {
  const c = normalizeDataCurrency(currency);
  const lines = customers
    .map(
      (x) =>
        `- id ${x.id}: ${x.name}, ${x.churnProbability}% churn risk, health ${x.health}/100, ${
          x.revenue > 0 ? `revenue ${formatMoney(x.revenue, c)}` : "revenue unknown"
        }. Risk reasons: ${x.factors.length ? x.factors.join("; ") : "none recorded"}`,
    )
    .join("\n");
  return `You are ChAi, a customer-retention analyst. For each customer below, write ONE short plain-language sentence (max ~16 words) that names the actual reason they are at risk (from their risk reasons, in everyday words) and one action the user does themselves, e.g. "Payments are slipping — call Northstar Legal this week."

${AI_FACT_RULES}

${AI_FEATURE_RULES}

${currencyRule(c)}

Customers:
${lines}

Return ONLY a JSON object (no markdown, no code fences) mapping each customer id to its one-sentence tip.`;
}
