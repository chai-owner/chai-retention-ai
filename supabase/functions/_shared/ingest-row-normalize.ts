// Ported verbatim from src/lib/ingest-row-normalize.ts.
export type Col = { from: string; to: string[] };

export const INGEST_COLUMNS: Record<string, Col[]> = {
  customers: [{ from: "customer_id", to: ["customer_id"] }],
  transactions: [
    { from: "transaction_id", to: ["transaction_id"] },
    { from: "customer_id", to: ["customer_id"] },
    { from: "amount", to: ["amount"] },
    { from: "occurred_at", to: ["transaction_date", "date"] },
    { from: "due_date", to: ["due_date"] },
    { from: "amount_due", to: ["amount_due"] },
    { from: "paid_date", to: ["paid_date"] },
    { from: "days_overdue", to: ["days_overdue"] },
  ],
  support: [
    { from: "ticket_id", to: ["ticket_id"] },
    { from: "customer_id", to: ["customer_id"] },
  ],
  usage: [
    { from: "customer_id", to: ["customer_id"] },
    { from: "occurred_at", to: ["date", "occurred_at"] },
  ],
  surveys: [
    { from: "customer_id", to: ["customer_id"] },
    { from: "submitted_at", to: ["survey_date", "date", "submitted_at"] },
  ],
};

export function stringifyCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

const PLATFORM_PROVIDERS = new Set([
  "zendesk",
  "intercom",
  "freshdesk",
  "hubspot",
  "salesforce",
  "zoho",
  "quickbooks",
  "freshbooks",
  "xero",
]);

export function batchSource(kind: string, provider: string): string {
  const k = (kind || "").trim().toLowerCase();
  const p = (provider || "").trim().toLowerCase();
  if (k === "drop") return "drop";
  if (PLATFORM_PROVIDERS.has(p)) return p;
  if (k === "crm" || k === "accounting" || k === "support") return p || "unknown";
  return "csv";
}

export function normalizeIngestRow(
  raw: Record<string, unknown>,
  cols: Col[],
  fallbackSource?: string,
): Record<string, string> {
  const blob = (raw["data"] as Record<string, unknown> | null) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(blob)) out[k] = stringifyCell(v);
  for (const c of cols) {
    const v = stringifyCell(raw[c.from]);
    if (!v) continue;
    for (const target of c.to) if (!out[target]) out[target] = v;
  }
  if (!out["__source"]?.trim() && fallbackSource) out["__source"] = fallbackSource;
  return out;
}

export const INGEST_PAGE = 1000;
