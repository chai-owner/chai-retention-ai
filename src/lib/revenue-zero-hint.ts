import type { Customer } from "@/lib/mock-data";

/** An estimate of zero is inconclusive if any customer is unscoreable or revenue is absent. */
export function revenueZeroHint(
  amount: number,
  customers: Pick<Customer, "revenue" | "hasUsableRevenue">[],
  notEnoughDataCount: number,
  normalHint: string,
): string {
  if (amount === 0 && (notEnoughDataCount > 0 || !customers.some((c) => c.hasUsableRevenue ?? c.revenue > 0))) {
    return "Not enough data yet to estimate";
  }
  return normalHint;
}