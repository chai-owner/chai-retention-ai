// Text under the dashboard "At-risk customers" number. When some customers
// can't be scored yet ("Not enough data yet"), say so — "0 critical" alone
// reads as "everyone is fine" when most of the base is simply unscoreable.
export function atRiskHint(criticalCount: number, notEnoughDataCount: number): string {
  if (notEnoughDataCount > 0) {
    return `${criticalCount} critical · ${notEnoughDataCount} not enough data to judge`;
  }
  return `${criticalCount} critical`;
}
