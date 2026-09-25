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

/** True for a CRM deal row (Zoho / HubSpot), as opposed to an invoice/payment. */
export function isDealRow(row: Record<string, unknown>): boolean {
  return String(row["deal_status"] ?? "").trim() !== "";
}

/**
 * Fewest deal-only customers needed before deal sizes are compared across
 * customers. Below this, deal-only customers get no score from spend /
 * order-size measures rather than a comparison against a handful of peers.
 */
export const MIN_DEAL_PEERS = 5;

/**
 * Returns `data` with transactions reduced to the rows scoring should use:
 *  1. open and lost CRM deals are removed (they aren't sales);
 *  2. invoices first — a customer with any invoice, payment or uploaded
 *     transaction has their won deals removed too, so deal amounts never mix
 *     with invoice amounts (no inflated averages or trends, no double-counting
 *     a deal that was later invoiced). Won deals only stand in for customers
 *     who have nothing else.
 */
export function withCountableTransactions<T extends IngestedData>(data: T): T {
  const tx = data.transactions;
  if (!tx || tx.length === 0) return data;
  const won = tx.filter((r) => isCountableTransaction(r as Record<string, unknown>));
  const hasInvoices = new Set<string>();
  for (const r of won) {
    if (!isDealRow(r as Record<string, unknown>)) hasInvoices.add(String(r.customer_id ?? ""));
  }
  const kept = won.filter(
    (r) => !isDealRow(r as Record<string, unknown>) || !hasInvoices.has(String(r.customer_id ?? "")),
  );
  return kept.length === tx.length ? data : { ...data, transactions: kept };
}

/** Customers whose (already filtered) sales data is CRM deals only. */
export function dealOnlyCustomers(data: IngestedData): Set<string> {
  const deal = new Set<string>();
  const other = new Set<string>();
  for (const r of data.transactions ?? []) {
    const id = String(r.customer_id ?? "");
    if (!id) continue;
    (isDealRow(r as Record<string, unknown>) ? deal : other).add(id);
  }
  for (const id of other) deal.delete(id);
  return deal;
}
