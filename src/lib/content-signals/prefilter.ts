// Cheap pre-filter: drop obviously signal-free text before it reaches a model.
// Per the cost section of the phased plan this typically removes 30-50% of
// spend, and it is deliberately conservative — when in doubt, extract.

export type SkipReason = "too_short" | "automated" | null;

const AUTOMATED_MARKERS = [
  "out of office",
  "automatic reply",
  "auto-reply",
  "autoreply",
  "do not reply to this email",
  "this is an automated message",
  "delivery status notification",
  "undeliverable:",
  "unsubscribe from these",
];

const PLEASANTRIES = [
  "thanks",
  "thank you",
  "thanks!",
  "ta",
  "cheers",
  "great, thanks",
  "perfect thanks",
  "got it",
  "ok",
  "okay",
  "received",
  "noted",
  "👍",
];

/** Minimum words worth paying a model to read. */
export const MIN_WORDS = 6;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Null means "send it to the model". A string is the reason it was skipped,
 * stored on the row so a skip is explainable rather than silent.
 */
export function prefilterSkipReason(body: string): SkipReason {
  const text = String(body ?? "").trim();
  if (!text) return "too_short";

  const lower = text.toLowerCase();
  if (AUTOMATED_MARKERS.some((m) => lower.includes(m))) return "automated";

  const stripped = lower.replace(/[^\p{L}\p{N}\s👍]/gu, "").trim();
  if (PLEASANTRIES.includes(stripped)) return "too_short";

  if (words(text) < MIN_WORDS) return "too_short";
  return null;
}

export function shouldExtract(body: string): boolean {
  return prefilterSkipReason(body) === null;
}
