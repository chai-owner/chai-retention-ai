// Rebuild a client-side ingest row from a persisted DB row.
//
// Persisted rows keep the provider's original payload in `data` plus the
// canonical fields (customer_id, amount, dates) in dedicated columns. Some
// sources never put those canonical fields in the payload, so reading `data`
// alone loses the customer link, the amount and the date — everything then
// scores as unattributed and the account looks empty. Merge the columns back
// in, without ever overwriting a value the payload already carries.

export type Col = { from: string; to: string[] };

export const INGEST_COLUMNS: Record<string, Col[]> = {
  customers: [{ from: "customer_id", to: ["customer_id"] }],
  transactions: [
    { from: "transaction_id", to: ["transaction_id"] },
    { from: "customer_id", to: ["customer_id"] },
    { from: "amount", to: ["amount"] },
    { from: "occurred_at", to: ["transaction_date", "date"] },
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

export function normalizeIngestRow(
  raw: Record<string, unknown>,
  cols: Col[],
): Record<string, string> {
  const blob = (raw["data"] as Record<string, unknown> | null) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(blob)) out[k] = stringifyCell(v);
  for (const c of cols) {
    const v = stringifyCell(raw[c.from]);
    if (!v) continue;
    for (const target of c.to) if (!out[target]) out[target] = v;
  }
  return out;
}
