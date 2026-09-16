export const IMPERSONATION_DURATION_MS = 30 * 60 * 1000;

export type ImpersonationEndReason = "manual" | "timeout";

export function impersonationExpiresAt(startedAt: string): string {
  return new Date(Date.parse(startedAt) + IMPERSONATION_DURATION_MS).toISOString();
}

export function impersonationEndReason(startedAt: string, now = Date.now()): ImpersonationEndReason {
  return now >= Date.parse(impersonationExpiresAt(startedAt)) ? "timeout" : "manual";
}