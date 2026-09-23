// Per-account monthly ceiling on content extraction spend.
//
// The ceiling exists so a single heavy account can never quietly run up model
// cost: extraction pauses for the rest of the month and the account owner is
// told, rather than the bill growing silently.

/** Rough gateway pricing for the extraction model, USD per million tokens. */
export const INPUT_USD_PER_MTOK = 0.3;
export const OUTPUT_USD_PER_MTOK = 2.5;

/** Default monthly ceiling per account, in USD. */
export const DEFAULT_MONTHLY_CEILING_USD = 5;

export interface UsageSnapshot {
  period: string;
  conversationsExtracted: number;
  estimatedCostUsd: number;
  pausedAt: string | null;
}

/** Calendar month key, e.g. "2026-09". Usage resets with it. */
export function periodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const input = (Math.max(0, inputTokens) / 1_000_000) * INPUT_USD_PER_MTOK;
  const output = (Math.max(0, outputTokens) / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Number((input + output).toFixed(6));
}

/** Cheap token estimate when the gateway doesn't report usage: ~4 chars/token. */
export function approxTokens(text: string): number {
  return Math.ceil(String(text ?? "").length / 4);
}

export function isOverCeiling(
  usage: Pick<UsageSnapshot, "estimatedCostUsd">,
  ceilingUsd: number = DEFAULT_MONTHLY_CEILING_USD,
): boolean {
  return usage.estimatedCostUsd >= ceilingUsd;
}

/** Plain-language line for the account owner when extraction pauses. */
export function describeCeilingPause(ceilingUsd: number = DEFAULT_MONTHLY_CEILING_USD): string {
  return `Reading new conversations is paused for this month — this account reached its $${ceilingUsd} analysis limit. It resumes automatically next month.`;
}
