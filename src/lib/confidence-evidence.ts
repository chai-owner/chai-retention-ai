// Evidence behind a confidence level. A kind of data (sales, support, usage,
// surveys…) only counts toward confidence when this customer has at least
// MIN_EVIDENCE_RECORDS dated records of it — the same minimum the own-history
// comparison uses. Thinner kinds still feed the score; they just don't make
// ChAi more sure of it, and the reason text says so plainly.
import { MIN_NORMAL_RECORDS } from "@/lib/personal-baseline";
import { churnConfidenceFor, type ChurnConfidence } from "@/lib/churn-probability";

export const MIN_EVIDENCE_RECORDS = MIN_NORMAL_RECORDS;

type Row = Record<string, unknown>;

const DATE_FIELDS: Record<string, string[]> = {
  transactions: ["transaction_date", "date", "occurred_at", "invoice_date", "paid_date"],
  support: ["created_at", "date", "opened_at", "occurred_at"],
  usage: ["date", "activity_date", "visit_date", "occurred_at"],
  surveys: ["submitted_at", "date", "created_at", "occurred_at"],
};
const GENERIC_DATE_FIELDS = ["date", "occurred_at", "created_at", "submitted_at"];

function hasDate(row: Row, fields: string[]): boolean {
  for (const f of fields) {
    const v = row[f];
    if (v == null || v === "") continue;
    if (!Number.isNaN(Date.parse(String(v)))) return true;
  }
  return false;
}

/** Dated records per data source per customer: source → customer → count. */
export function datedRecordCounts(data: Record<string, unknown>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [key, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || key === "customers") continue;
    const source = key === "payments" || key === "invoices" ? "transactions" : key;
    const fields = DATE_FIELDS[source] ?? GENERIC_DATE_FIELDS;
    const bySource = out.get(source) ?? new Map<string, number>();
    for (const r of rows as Row[]) {
      const id = String(r?.customer_id ?? "").trim();
      if (!id || !hasDate(r, fields)) continue;
      bySource.set(id, (bySource.get(id) ?? 0) + 1);
    }
    out.set(source, bySource);
  }
  return out;
}

const NOUNS: Record<string, [string, string]> = {
  transactions: ["sale", "sales"],
  support: ["support ticket", "support tickets"],
  usage: ["activity record", "activity records"],
  surveys: ["survey response", "survey responses"],
};

function phrase(source: string, n: number): string {
  const [one, many] = NOUNS[source] ?? ["dated record", "dated records"];
  if (n <= 0) return `no dated ${many}`;
  return n === 1 ? `a single ${one}` : `only ${n} ${many}`;
}

export interface ConfidenceAssessment {
  confidence: ChurnConfidence;
  /** Kinds of data with enough evidence to count. */
  dataCategories: number;
  /** Plain reason when a kind was held back for thin evidence; else null. */
  reason: string | null;
}

/**
 * `sources` = kinds of data that fed this customer's score; `countFor` = how
 * many dated records the customer has of that kind.
 */
export function assessConfidence(
  sources: Iterable<string>,
  countFor: (source: string) => number,
): ConfidenceAssessment {
  let counted = 0;
  const thin: string[] = [];
  for (const s of new Set(sources)) {
    const n = countFor(s);
    if (n >= MIN_EVIDENCE_RECORDS) counted++;
    else thin.push(phrase(s, n));
  }
  const reason = thin.length ? `based on ${thin.join(" and ")}` : null;
  return { confidence: churnConfidenceFor(counted), dataCategories: counted, reason };
}
