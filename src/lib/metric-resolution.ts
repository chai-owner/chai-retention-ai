import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { customMetricKeys } from "@/lib/personalize-data";

const DAY = 86400000;
const IDENTIFIERS = new Set([
  "customer_id", "email", "customer_email", "customer_name", "name", "transaction_id", "ticket_id",
  "__source", "date", "occurred_at", "submitted_at", "created_at", "transaction_date", "survey_date",
]);
const DATE_WORDS = new Set(["date", "time", "at", "since", "last", "signup", "joined", "created", "visit"]);
const DATASET_KEYS = ["customers", "transactions", "usage", "support", "surveys"] as const;

// Domain-neutral vocabulary groups let an AI-named metric match common source
// column wording without coupling the engine to one industry or metric name.
const CONCEPTS = [
  ["average", "avg", "mean"],
  ["duration", "minutes", "hours", "time", "length"],
  ["frequency", "count", "visits", "attendance", "checkin", "logins", "sessions"],
  ["visit", "attendance", "checkin", "activity", "usage"],
  ["purchase", "transaction", "order", "invoice", "payment", "billing", "dues", "fee"],
  ["delinquency", "delinquent", "overdue", "unpaid", "late", "failed", "status"],
  ["upsell", "upgrade", "addon", "additional", "auxiliary", "service", "training"],
  ["tenure", "signup", "joined", "start", "lifespan", "months", "years", "milestone"],
  ["peak", "busy", "busiest", "capacity", "crowded"],
  ["offpeak", "quiet", "uncrowded"],
  ["satisfaction", "csat", "nps", "recommend", "motivation", "survey"],
  ["support", "ticket", "issue", "resolution", "complaint"],
] as const;

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/off[\s_-]?peak/g, "offpeak")
      .replace(/check[\s_-]?in/g, "checkin")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1)
      .map((word) => word.replace(/(ies|ing|ed|s)$/i, (suffix) => suffix === "ies" ? "y" : "")),
  );
}

function expand(input: Set<string>): Set<string> {
  const out = new Set(input);
  for (const group of CONCEPTS) {
    if (group.some((term) => input.has(term))) group.forEach((term) => out.add(term));
  }
  return out;
}

function metricText(metric: PlannerMetric): string {
  return [metric.name, metric.why, metric.churn, metric.category, metric.reason ?? ""].join(" ");
}

function flattenRow(row: IngestRow): IngestRow {
  const out: IngestRow = {};
  const visit = (value: unknown, prefix = "") => {
    if (value == null) return;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        visit(nested, prefix ? `${prefix}_${key}` : key);
      }
      return;
    }
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try {
        visit(JSON.parse(value), prefix);
        return;
      } catch {
        // Ordinary text that happens to begin with a brace remains text.
      }
    }
    if (prefix) out[prefix.replace(/^data_/, "")] = String(value);
  };
  visit(row);
  return { ...row, ...out };
}

function numeric(value?: string): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function timestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function dateFor(row: IngestRow): number | null {
  for (const field of ["visit_date", "transaction_date", "survey_date", "date", "occurred_at", "submitted_at", "created_at", "signup_date", "check_in"]) {
    const parsed = timestamp(row[field]);
    if (parsed != null) return parsed;
  }
  return null;
}

type Operation = "average" | "sum" | "days_since_last" | "months_since" | "ratio" | "latest";

function operationFor(metric: PlannerMetric): Operation {
  const text = metricText(metric).toLowerCase();
  if (/days?\s+since|consecutive days.*absent/.test(text)) return "days_since_last";
  if (/tenure|lifespan|months? or years?|how many months|milestone/.test(text)) return "months_since";
  if (/\b(rate|ratio|percent(?:age)?|utili[sz]ation|delinquen\w*|peak|recommend\w*)\b/.test(text)) return "ratio";
  if (/weekly|frequency|how many times|count/.test(text)) return "sum";
  if (/average|mean|duration/.test(text)) return "average";
  return "latest";
}

function preferredDatasets(metric: PlannerMetric): string[] {
  const text = metricText(metric).toLowerCase();
  const preferred: string[] = [];
  if (/support|ticket|issue|resolution|complaint/.test(text)) preferred.push("support");
  if (/survey|satisfaction|csat|nps|recommend|motivation/.test(text)) preferred.push("surveys");
  if (/transaction|purchase|order|invoice|payment|billing|dues|fee|upsell|service/.test(text)) preferred.push("transactions");
  if (/usage|activity|visit|attendance|check.?in|workout|peak|session|login/.test(text)) preferred.push("usage");
  if (/tenure|signup|joined|member profile|customer profile|lifespan/.test(text)) preferred.push("customers");
  if (preferred.length === 0) {
    const category = metric.category.toLowerCase();
    if (category.includes("support")) preferred.push("support");
    else if (category.includes("transaction")) preferred.push("transactions");
    else if (category.includes("satisfaction")) preferred.push("surveys");
    else preferred.push("usage");
  }
  return [...new Set(preferred)];
}

interface FieldCandidate {
  dataset: string;
  field: string;
  score: number;
}

function selectField(metric: PlannerMetric, data: IngestedData): FieldCandidate | null {
  const operation = operationFor(metric);
  const baseWords = words(metricText(metric));
  const metricWords = expand(baseWords);
  const preferred = new Set(preferredDatasets(metric));
  const candidates = new Map<string, FieldCandidate>();

  for (const dataset of DATASET_KEYS) {
    for (const raw of data[dataset] ?? []) {
      const row = flattenRow(raw);
      for (const field of Object.keys(row)) {
        if (IDENTIFIERS.has(field)) continue;
        const fieldWords = words(field);
        const expandedField = expand(fieldWords);
        let score = preferred.has(dataset) ? 3 : 0;
        for (const word of fieldWords) if (baseWords.has(word)) score += 8;
        for (const word of expandedField) if (metricWords.has(word)) score += 2;
        const isDate = [...fieldWords].some((word) => DATE_WORDS.has(word));
        if ((operation === "days_since_last" || operation === "months_since") && isDate) score += 7;
        if (operation !== "days_since_last" && operation !== "months_since" && isDate) score -= 4;
        const key = `${dataset}:${field}`;
        const previous = candidates.get(key);
        if (!previous || score > previous.score) candidates.set(key, { dataset, field, score });
      }
    }
  }
  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  return ranked.length > 0 && ranked[0].score >= 7 ? ranked[0] : null;
}

function conditionValue(value: string, metric: PlannerMetric): number | null {
  const numericValue = numeric(value);
  if (numericValue != null) return numericValue > 0 ? 1 : 0;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const negativeMetric = /delinquen|overdue|unpaid|late|failed|churn|missed/.test(metricText(metric).toLowerCase());
  const negativeValue = /overdue|unpaid|late|failed|declined|delinquent|yes|true/.test(normalized);
  const positiveValue = /paid|current|complete|no|false|resolved/.test(normalized);
  if (negativeMetric) return negativeValue ? 1 : positiveValue ? 0 : null;
  if (negativeValue || normalized === "true" || normalized === "yes") return 1;
  if (positiveValue || normalized === "false" || normalized === "no") return 0;
  return null;
}

export interface ResolvedMetric {
  dataset: string | null;
  field: string | null;
  rowCount: number;
  latestDate: number | null;
  values: Map<string, number>;
}

export function resolveMetric(metric: PlannerMetric, data: IngestedData, now = Date.now()): ResolvedMetric {
  const custom = customMetricKeys([metric])[0];
  const customRows = custom ? data[custom.key] ?? [] : [];
  const directRows = custom ? customRows.filter((row) => numeric(flattenRow(row)[custom.column]) != null) : [];
  const usesDirectMetricDataset = directRows.length > 0;
  const selected = directRows.length > 0
    ? { dataset: custom?.key ?? "", field: custom?.column ?? "", score: 100 }
    : selectField(metric, data);
  if (!selected) return { dataset: preferredDatasets(metric)[0] ?? null, field: null, rowCount: 0, latestDate: null, values: new Map() };

  const operation = usesDirectMetricDataset ? "latest" : operationFor(metric);
  const grouped = new Map<string, Array<{ value: string; date: number | null }>>();
  let latestDate: number | null = null;
  for (const raw of data[selected.dataset] ?? []) {
    const row = flattenRow(raw);
    const id = (row.customer_id ?? "").trim();
    const value = row[selected.field];
    if (!id || value == null || value.trim() === "") continue;
    const date = dateFor(row);
    if (date != null && (latestDate == null || date > latestDate)) latestDate = date;
    grouped.set(id, [...(grouped.get(id) ?? []), { value, date }]);
  }

  const values = new Map<string, number>();
  for (const [id, entries] of grouped) {
    let value: number | null = null;
    if (operation === "days_since_last" || operation === "months_since") {
      const dates = entries.map((entry) => timestamp(entry.value)).filter((date): date is number => date != null);
      if (dates.length > 0) {
        const reference = operation === "months_since" ? Math.min(...dates) : Math.max(...dates);
        const elapsed = Math.max(0, (now - reference) / (operation === "months_since" ? DAY * 30.4375 : DAY));
        value = operation === "days_since_last" ? Math.round(elapsed) : elapsed;
      }
    } else if (operation === "ratio") {
      const flags = entries.map((entry) => conditionValue(entry.value, metric)).filter((flag): flag is number => flag != null);
      if (flags.length > 0) value = (flags.reduce((sum, flag) => sum + flag, 0) / flags.length) * 100;
    } else {
      let usable = entries;
      if (operation === "sum" && /weekly/.test(metricText(metric).toLowerCase())) {
        const dated = entries.filter((entry) => entry.date != null);
        const maxDate = Math.max(...dated.map((entry) => entry.date ?? 0));
        if (maxDate > 0) usable = dated.filter((entry) => (entry.date ?? 0) >= maxDate - 6 * DAY);
      }
      const numbers = usable.map((entry) => numeric(entry.value)).filter((entry): entry is number => entry != null);
      if (numbers.length > 0) {
        if (operation === "sum") value = numbers.reduce((sum, number) => sum + number, 0);
        else if (operation === "average") value = numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
        else {
          const dated = usable.filter((entry) => entry.date != null);
          const latest = dated.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
          value = numeric(latest?.value ?? usable[usable.length - 1]?.value);
        }
      }
    }
    if (value != null && Number.isFinite(value)) values.set(id, value);
  }
  return { dataset: selected.dataset, field: selected.field, rowCount: [...grouped.values()].reduce((sum, rows) => sum + rows.length, 0), latestDate, values };
}

export function metricDatasetDependencies(metric: PlannerMetric, data: IngestedData): string[] {
  const resolved = resolveMetric(metric, data);
  return resolved.dataset ? [resolved.dataset] : preferredDatasets(metric);
}