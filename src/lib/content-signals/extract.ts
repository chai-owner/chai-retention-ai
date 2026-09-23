// Content-based risk-signal extraction — prompt construction and response
// parsing. Pure functions only, so they can be unit tested without network.
//
// STATUS: validation-stage only. Nothing in the product calls this yet.
import { SIGNAL_TYPES, type SignalType } from "./test-set";

export interface ExtractedSignal {
  signal: SignalType;
  /** Verbatim span from the source text supporting the signal. */
  quote: string;
  /** 0-1 model-reported confidence. */
  confidence: number;
}

export const SIGNAL_DEFINITIONS: Record<SignalType, string> = {
  competitor_mentioned:
    "The customer refers to an alternative vendor, a comparison, an evaluation, a bake-off, a migration to another provider, or a peer/parent company using something else for this job. Generic mentions of unrelated tools they happen to use do NOT count.",
  cancellation_intent:
    "The customer signals they may stop paying: cancelling, not renewing, asking about notice periods or termination terms, turning off auto-renew, cutting to the minimum, or hedging that they may not be here at renewal.",
  champion_departure:
    "The person who owned, sponsored or used the account has left the company, changed role, been made redundant, or the account has been handed to someone new who does not know it.",
  company_distress:
    "The customer's own business is under strain: layoffs, redundancies, hiring freeze, budget cuts, spend freeze, restructuring, office closures, cash-flow trouble, failed funding, or acquisition-driven contract freezes.",
};

export function buildExtractionPrompt(conversation: string): string {
  const defs = SIGNAL_TYPES.map((s) => `- ${s}: ${SIGNAL_DEFINITIONS[s]}`).join("\n");
  return [
    "You read a single customer support or CRM conversation and extract risk signals from it.",
    "",
    "Signal types:",
    defs,
    "",
    "Rules:",
    "- Only report a signal if the text genuinely supports it. Most conversations contain no signal at all; returning an empty list is the correct and common answer.",
    "- Precision matters more than coverage: a wrong flag on a healthy account is worse than a missed one. If you are unsure, do not report it.",
    '- "quote" must be copied verbatim from the conversation, at most one sentence.',
    "- confidence is 0 to 1.",
    "- Report each signal type at most once.",
    "",
    'Respond with JSON only, exactly: {"signals":[{"signal":"...","quote":"...","confidence":0.0}]}',
    "",
    "Conversation:",
    '"""',
    conversation,
    '"""',
  ].join("\n");
}

/** Tolerant parse: models sometimes wrap JSON in prose or code fences. */
export function parseExtractionResponse(raw: string): ExtractedSignal[] {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { signals?: unknown })?.signals;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ExtractedSignal[] = [];
  for (const item of list) {
    const row = item as Partial<ExtractedSignal>;
    const signal = row?.signal;
    if (!signal || !SIGNAL_TYPES.includes(signal) || seen.has(signal)) continue;
    seen.add(signal);
    const confidence = typeof row.confidence === "number" ? Math.min(1, Math.max(0, row.confidence)) : 0;
    out.push({ signal, quote: typeof row.quote === "string" ? row.quote : "", confidence });
  }
  return out;
}

/** A quote is only trustworthy if it actually appears in the source. */
export function quoteIsGrounded(quote: string, source: string): boolean {
  const q = quote.trim().toLowerCase();
  if (q.length < 8) return false;
  return source.toLowerCase().includes(q);
}
