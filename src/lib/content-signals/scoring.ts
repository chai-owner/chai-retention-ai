// Phase 3: content risk signals as a real (but modest) input to the health
// score. Pure maths, shared by the nightly scoring job and the "Not right"
// dismissal path so both produce exactly the same numbers.
//
// VALIDATION STATUS: every content source (Zendesk, HubSpot, Intercom) is only
// provisionally validated — constructed examples and hand-written test
// conversations, not organic customer language at scale. That is why:
//  - the weight is deliberately small (below the default metric importance of
//    3 and far below overdue payments at 5), and identical for every source;
//  - signals fade with age and stop counting entirely after 180 days;
//  - the combined penalty is capped, so no pile-up of flags can dominate.
import type { ChurnMetaEntry, CustomerScore, ScoreBreakdownEntry } from "@/lib/customer-scoring";
import { CHURN_META_METRIC, riskLevelFor } from "@/lib/customer-scoring";
import { CHURN_HORIZON_DAYS, churnConfidenceFor, churnProbabilityFromHealth } from "@/lib/churn-probability";

/** Breakdown entry name for the content signal contribution. */
export const CONTENT_SIGNAL_METRIC = "AI-detected conversation signals";
/** Same modest weight for every source — neither is more proven than the other. */
export const CONTENT_SIGNAL_WEIGHT = 1.5;
export const CONTENT_HALF_LIFE_DAYS = 30;
export const CONTENT_MAX_AGE_DAYS = 180;

/** How much a fresh, fully-confident signal of each type pulls (0–1). */
export const SIGNAL_SEVERITY: Record<string, number> = {
  cancellation_intent: 0.9,
  competitor_mentioned: 0.6,
  champion_departure: 0.5,
  company_distress: 0.5,
};
const DEFAULT_SEVERITY = 0.4;
const DAY = 86_400_000;

export interface ContentSignalInput {
  id: string;
  signal: string;
  source: string;
  confidence: number;
  occurred_at: string | null;
  detected_at?: string | null;
  dismissed_at?: string | null;
}

export interface ContentSignalContribution {
  id: string;
  signal: string;
  source: string;
  confidence: number;
  occurred_at: string | null;
  /** Points taken off the content entry (0–100) at scoring time. */
  penalty: number;
}

export interface ContentBreakdownEntry extends ScoreBreakdownEntry {
  basis: "content";
  signals: ContentSignalContribution[];
}

export function isContentEntry(entry: unknown): entry is ContentBreakdownEntry {
  return (
    !!entry &&
    typeof entry === "object" &&
    (entry as { basis?: unknown }).basis === "content" &&
    Array.isArray((entry as { signals?: unknown }).signals)
  );
}

export function contentEntryOf(breakdown: unknown): ContentBreakdownEntry | null {
  if (!Array.isArray(breakdown)) return null;
  return (breakdown.find(isContentEntry) as ContentBreakdownEntry | undefined) ?? null;
}

/** 1.0 for a signal from today, 0.5 after 30 days, 0 once older than 180 days. */
export function decayFactor(ageDays: number): number {
  if (!Number.isFinite(ageDays)) return 0;
  const age = Math.max(0, ageDays);
  if (age >= CONTENT_MAX_AGE_DAYS) return 0;
  return Math.pow(0.5, age / CONTENT_HALF_LIFE_DAYS);
}

function normConfidence(c: number): number {
  const n = Number(c);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n > 1 ? n / 100 : n);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Penalty (0–100 points on the content entry) a single signal carries now. */
export function signalPenalty(s: ContentSignalInput, now: number): number {
  if (s.dismissed_at) return 0;
  const at = Date.parse(s.occurred_at ?? s.detected_at ?? "");
  if (!Number.isFinite(at)) return 0;
  const severity = SIGNAL_SEVERITY[s.signal] ?? DEFAULT_SEVERITY;
  return 100 * severity * normConfidence(s.confidence) * decayFactor((now - at) / DAY);
}

/**
 * The content breakdown entry for one customer, or null when nothing active
 * contributes (all dismissed or fully decayed). Customers without signals get
 * no entry at all — silence must never inflate a score.
 */
export function buildContentEntry(
  signals: ContentSignalInput[],
  now: number = Date.now(),
): ContentBreakdownEntry | null {
  const contributions: ContentSignalContribution[] = [];
  for (const s of signals) {
    const penalty = signalPenalty(s, now);
    if (penalty <= 0) continue;
    contributions.push({
      id: s.id,
      signal: s.signal,
      source: s.source,
      confidence: normConfidence(s.confidence),
      occurred_at: s.occurred_at ?? s.detected_at ?? null,
      penalty: round2(penalty),
    });
  }
  if (contributions.length === 0) return null;
  contributions.sort((a, b) => b.penalty - a.penalty);
  const total = Math.min(100, contributions.reduce((sum, c) => sum + c.penalty, 0));
  return {
    metric: CONTENT_SIGNAL_METRIC,
    value: contributions.length,
    normalised: round2(Math.max(0, 100 - total)),
    weight: CONTENT_SIGNAL_WEIGHT,
    basis: "content",
    baseline: null,
    signals: contributions,
  };
}

/**
 * Re-applies content signals to a scored customer: strips any previous content
 * entry, adds the fresh one, and recomputes score, risk level and churn meta
 * from the stored normalised values × weights (the same weighted mean
 * scoreCustomers uses).
 */
export function applyContentSignals(
  score: Pick<CustomerScore, "customer_id" | "score_breakdown"> & Partial<CustomerScore>,
  signals: ContentSignalInput[],
  now: number = Date.now(),
): CustomerScore {
  const previous = Array.isArray(score.score_breakdown) ? score.score_breakdown : [];
  const oldMeta = previous.find(
    (e) => (e as { metric?: unknown }).metric === CHURN_META_METRIC,
  ) as ChurnMetaEntry | undefined;
  const metricEntries = previous.filter(
    (e) => (e as { metric?: unknown }).metric !== CHURN_META_METRIC && !isContentEntry(e),
  ) as ScoreBreakdownEntry[];

  const content = buildContentEntry(signals, now);
  const entries: ScoreBreakdownEntry[] = content ? [...metricEntries, content] : metricEntries;

  let weighted = 0;
  let total = 0;
  for (const e of entries) {
    const w = Number(e.weight) || 0;
    if (!Number.isFinite(e.normalised) || w <= 0) continue;
    weighted += e.normalised * w;
    total += w;
  }
  const newScore = total > 0 ? round2(weighted / total) : Number(score.score ?? 0);
  const churn = churnProbabilityFromHealth(newScore);
  // Content is not a data category — confidence stays with the hard data.
  const categories = oldMeta?.data_categories ?? new Set(metricEntries.map((e) => e.metric)).size;
  const confidence = oldMeta?.confidence ?? churnConfidenceFor(categories);
  const meta: ChurnMetaEntry = {
    metric: CHURN_META_METRIC,
    churn_probability: churn,
    churn_horizon_days: CHURN_HORIZON_DAYS,
    confidence,
    data_categories: categories,
  };
  return {
    customer_id: score.customer_id,
    score: newScore,
    risk_level: riskLevelFor(newScore),
    churn_probability: churn,
    churn_confidence: confidence,
    score_breakdown: [...entries, meta],
  };
}

/**
 * Maps signal `customer_ref`s onto scored customer ids: the id itself, any
 * saved linked alias (support requester → company, duplicate → master), and
 * the company name as a last resort — the same references the customer page
 * uses to show the flags.
 */
export function buildRefResolver(
  customerIds: string[],
  aliases: Array<{ source_id: string; customer_id: string | null; status: string }>,
  names: Record<string, string> = {},
): (ref: string | null) => string | null {
  const ids = new Set(customerIds);
  const aliasMap = new Map<string, string>();
  for (const a of aliases) {
    if (a.status === "linked" && a.customer_id) aliasMap.set(a.source_id, a.customer_id);
  }
  const byName = new Map<string, string>();
  for (const [id, name] of Object.entries(names)) {
    const k = name.trim().toLowerCase();
    if (k && ids.has(id) && !byName.has(k)) byName.set(k, id);
  }
  return (ref) => {
    if (!ref) return null;
    let cur = ref.trim();
    for (let hop = 0; hop < 4; hop++) {
      if (ids.has(cur)) return cur;
      const next = aliasMap.get(cur);
      if (!next || next === cur) break;
      cur = next;
    }
    return byName.get(ref.trim().toLowerCase()) ?? null;
  };
}

/** Groups active signals by the scored customer they resolve to. */
export function groupSignalsByCustomer(
  signals: Array<ContentSignalInput & { customer_ref: string | null }>,
  resolve: (ref: string | null) => string | null,
): Map<string, ContentSignalInput[]> {
  const out = new Map<string, ContentSignalInput[]>();
  for (const s of signals) {
    if (s.dismissed_at) continue;
    const id = resolve(s.customer_ref);
    if (!id) continue;
    const bucket = out.get(id);
    if (bucket) bucket.push(s);
    else out.set(id, [s]);
  }
  return out;
}

/** Dismissal path: drop one signal from a stored snapshot and re-score. */
export function removeSignalFromSnapshot(
  row: Pick<CustomerScore, "customer_id" | "score_breakdown"> & Partial<CustomerScore>,
  signalId: string,
  now: number = Date.now(),
): CustomerScore {
  const entry = contentEntryOf(row.score_breakdown);
  const remaining: ContentSignalInput[] = (entry?.signals ?? [])
    .filter((s) => s.id !== signalId)
    .map((s) => ({ ...s }));
  return applyContentSignals(row, remaining, now);
}
