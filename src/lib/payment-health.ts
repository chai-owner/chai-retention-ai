// Payment health: turns overdue-invoice data (currently sourced from Xero and
// QuickBooks) into a churn signal.
//
// Unpaid invoices are one of the strongest leading indicators of churn, so this
// is scored as its own high-weight metric rather than being folded into revenue.
// Everything here is derived at read time from `due_date` / `amount_due` so a
// stored `days_overdue` never goes stale between syncs.

export const PAYMENT_HEALTH_METRIC = "Payment Health";
/** Only invoices from the recent past count towards payment health. */
export const PAYMENT_LOOKBACK_DAYS = 90;
/** Weight matches the highest-weight custom metrics. */
export const PAYMENT_HEALTH_WEIGHT = 5;

const DAY = 86_400_000;

export interface OverdueInvoice {
  customerId: string;
  transactionId: string;
  daysOverdue: number;
  amountDue: number;
  dueDate: string;
  currency: string;
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function dayStart(ms: number): number {
  return Date.parse(`${new Date(ms).toISOString().slice(0, 10)}T00:00:00Z`);
}

/**
 * Days past due for one transaction row. An invoice with nothing outstanding is
 * never overdue, whatever its due date says.
 */
export function rowDaysOverdue(row: Record<string, unknown>, now: number = Date.now()): number {
  const outstanding = num(row["amount_due"]);
  if (!Number.isFinite(outstanding) || outstanding <= 0) return 0;
  const due = String(row["due_date"] ?? "").trim();
  const dueMs = due ? Date.parse(`${due.slice(0, 10)}T00:00:00Z`) : NaN;
  if (isNaN(dueMs)) {
    // No usable due date — fall back to whatever the sync stored.
    const stored = num(row["days_overdue"]);
    return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : 0;
  }
  const today = dayStart(now);
  return dueMs >= today ? 0 : Math.round((today - dueMs) / DAY);
}

/**
 * 0–100 payment health from days overdue, banded:
 * 0 days → 100 · 1–30 → 70…40 · 31–60 → 40…15 · 60+ → 15…0 (0 at 120+ days).
 * Linear inside each band so severity keeps separating customers.
 */
export function paymentHealthScore(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 100;
  const lerp = (d: number, lo: number, hi: number, hiScore: number, loScore: number) =>
    hiScore - ((d - lo) / (hi - lo)) * (hiScore - loScore);
  if (days <= 30) return Math.round(lerp(days, 1, 30, 70, 40) * 100) / 100;
  if (days <= 60) return Math.round(lerp(days, 31, 60, 40, 15) * 100) / 100;
  return Math.round(Math.max(0, lerp(Math.min(days, 120), 61, 120, 15, 0)) * 100) / 100;
}

/** Every open overdue invoice inside the lookback window, worst first. */
export function overdueInvoices(
  transactions: Array<Record<string, unknown>> | undefined,
  now: number = Date.now(),
): OverdueInvoice[] {
  const cutoff = now - PAYMENT_LOOKBACK_DAYS * DAY;
  const out: OverdueInvoice[] = [];
  for (const row of transactions ?? []) {
    const days = rowDaysOverdue(row, now);
    if (days <= 0) continue;
    const when = String(row["transaction_date"] ?? row["date"] ?? row["due_date"] ?? "").slice(0, 10);
    const whenMs = when ? Date.parse(`${when}T00:00:00Z`) : NaN;
    // Undated rows still count; only clearly old invoices are dropped.
    if (!isNaN(whenMs) && whenMs < cutoff) continue;
    const amount = num(row["amount_due"]);
    out.push({
      customerId: String(row["customer_id"] ?? "").trim(),
      transactionId: String(row["transaction_id"] ?? ""),
      daysOverdue: days,
      amountDue: Number.isFinite(amount) ? amount : 0,
      dueDate: String(row["due_date"] ?? "").slice(0, 10),
      currency: String(row["currency"] ?? ""),
    });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Worst days-overdue per customer across the lookback window. */
export function maxDaysOverdueByCustomer(
  transactions: Array<Record<string, unknown>> | undefined,
  now: number = Date.now(),
): Map<string, number> {
  const worst = new Map<string, number>();
  for (const inv of overdueInvoices(transactions, now)) {
    if (!inv.customerId) continue;
    if ((worst.get(inv.customerId) ?? 0) < inv.daysOverdue) worst.set(inv.customerId, inv.daysOverdue);
  }
  return worst;
}

/** The single invoice to warn about on a customer's detail page. */
export function worstOverdueInvoice(
  transactions: Array<Record<string, unknown>> | undefined,
  customerId: string,
  now: number = Date.now(),
): OverdueInvoice | null {
  return (
    overdueInvoices(transactions, now).find((i) => i.customerId === customerId) ?? null
  );
}

/** True when any transaction row carries payment-status data at all. */
export function hasPaymentData(
  transactions: Array<Record<string, unknown>> | undefined,
): boolean {
  return (transactions ?? []).some(
    (r) => String(r["due_date"] ?? "").trim() !== "" || String(r["amount_due"] ?? "").trim() !== "",
  );
}
