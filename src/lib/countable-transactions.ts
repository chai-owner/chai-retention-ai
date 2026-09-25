// Which transaction rows count as sales for scoring.
//
// CRM deals carry a `deal_status` (won / lost / open). Only won deals are
// sales: an open deal's close date is a forecast (often in the future) and a
// lost deal never happened. Rows without a `deal_status` — invoices, payments,
// uploaded transactions — are real sales and always count.
import type { IngestedData } from "@/lib/ingested-data-store";

export function isCountableTransaction(row: Record<string, unknown>): boolean {
  const status = String(row["deal_status"] ?? "").trim().toLowerCase();
  return status === "" || status === "won";
}

/** Returns `data` with open and lost CRM deals removed from transactions. */
export function withCountableTransactions<T extends IngestedData>(data: T): T {
  const tx = data.transactions;
  if (!tx || tx.length === 0) return data;
  const kept = tx.filter((r) => isCountableTransaction(r as Record<string, unknown>));
  return kept.length === tx.length ? data : { ...data, transactions: kept };
}
