// Per-customer baseline: compare a customer against THEIR OWN history.
//
// Shared by the in-app scoring engine (real-scoring.ts) and the nightly stored
// score (customer-scoring.ts) so both judge "is this customer slipping?" the
// same way. Everything here works straight from dated records (invoices,
// deals, tickets, activity) — no stored history has to accumulate first.
//
// Two comparisons:
//  - trend:  last 30 days vs the 90 days before that (values, counts, rates)
//  - rhythm: the current gap since the last dated record vs this customer's
//            own usual gap between records ("going quiet")
//
// When a customer has too little history the comparison returns null and the
// caller keeps its existing cross-customer / fixed-window score. Thin history
// is blended with that fallback rather than trusted outright.

export const DAY = 86_400_000;
export const RECENT_DAYS = 30;
export const NORMAL_DAYS = 90;

/** Records needed in the "normal" period before a trend means anything. */
export const MIN_NORMAL_RECORDS = 3;
/** Records at which the personal comparison is fully trusted. */
export const FULL_TRUST_RECORDS = 6;
/** Dated records needed to know a customer's rhythm (gives 2+ gaps). */
export const MIN_RHYTHM_RECORDS = 3;

export type TrendMode = "average" | "sum" | "ratio";
export type Direction = "higher" | "lower";

export interface SeriesPoint {
  date: number;
  value: number;
}

export interface PersonalComparison {
  kind: "trend" | "rhythm";
  /** 0–100 health for this signal, judged against the customer's own normal. */
  score: number;
  /** 0–1 trust in the comparison, from how much history backs it. */
  trust: number;
  /** trend: recent-period value; rhythm: current gap in days. */
  current: number;
  /** trend: normal-period value; rhythm: usual gap in days. */
  normal: number;
  /** trend only: % change of recent vs normal. */
  changePct: number | null;
  evidence: number;
  mode?: TrendMode;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

export function trustFor(evidence: number, min: number): number {
  if (evidence < min) return 0;
  const span = Math.max(1, FULL_TRUST_RECORDS - min + 1);
  return Math.min(1, (evidence - min + 1) / span);
}

/**
 * Recent 30 days vs the prior 90 days.
 *  - average/ratio: mean value per record in each period (needs ≥1 recent record)
 *  - sum (counts, frequency): per-30-day rate in each period (0 recent is a real signal)
 * Unchanged scores 75 (steady is healthy); a 50% drop on a higher-is-better
 * signal scores 25, a doubling of a lower-is-better signal scores 25.
 */
export function compareTrend(
  points: SeriesPoint[] | undefined,
  mode: TrendMode,
  direction: Direction,
  now: number,
): PersonalComparison | null {
  if (!points || points.length === 0) return null;
  const recentStart = now - RECENT_DAYS * DAY;
  const normalStart = recentStart - NORMAL_DAYS * DAY;
  const recent = points.filter((p) => p.date >= recentStart && p.date <= now + DAY);
  const normal = points.filter((p) => p.date >= normalStart && p.date < recentStart);
  if (normal.length < MIN_NORMAL_RECORDS) return null;

  let cur: number;
  let base: number;
  if (mode === "sum") {
    cur = recent.reduce((s, p) => s + p.value, 0);
    base = normal.reduce((s, p) => s + p.value, 0) / (NORMAL_DAYS / RECENT_DAYS);
  } else {
    if (recent.length === 0) return null;
    cur = mean(recent.map((p) => p.value));
    base = mean(normal.map((p) => p.value));
  }
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base <= 0) return null;

  const ratio = cur / base;
  const score = direction === "higher" ? clamp(75 + (ratio - 1) * 100) : clamp(75 - (ratio - 1) * 50);
  return {
    kind: "trend",
    score: Math.round(score),
    trust: trustFor(normal.length, MIN_NORMAL_RECORDS),
    current: cur,
    normal: base,
    changePct: Math.round((ratio - 1) * 100),
    evidence: normal.length,
    mode,
  };
}

/**
 * Current gap since the last dated record vs this customer's usual gap
 * (median gap between consecutive records). Within their normal rhythm scores
 * 100; twice their usual gap scores 50; three times or more scores 0.
 */
export function compareRhythm(dates: number[] | undefined, now: number): PersonalComparison | null {
  if (!dates || dates.length < MIN_RHYTHM_RECORDS) return null;
  const days = [...new Set(dates.map((d) => Math.floor(d / DAY)))].sort((a, b) => a - b);
  if (days.length < MIN_RHYTHM_RECORDS) return null;
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const usual = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  if (!(usual > 0)) return null;
  const current = Math.max(0, Math.floor(now / DAY) - days[days.length - 1]);
  const g = current / usual;
  const score = g <= 1 ? 100 : clamp(100 - (g - 1) * 50);
  return {
    kind: "rhythm",
    score: Math.round(score),
    trust: trustFor(days.length, MIN_RHYTHM_RECORDS),
    current,
    normal: usual,
    changePct: null,
    evidence: days.length,
  };
}

export type ComparisonBasis = "personal" | "blended" | "fallback";

/** Mixes the personal score with the existing fallback by how much history backs it. */
export function blendScore(
  personal: PersonalComparison | null,
  fallback: number,
): { score: number; basis: ComparisonBasis } {
  if (!personal || personal.trust <= 0) return { score: fallback, basis: "fallback" };
  if (personal.trust >= 1) return { score: personal.score, basis: "personal" };
  return {
    score: Math.round(personal.trust * personal.score + (1 - personal.trust) * fallback),
    basis: "blended",
  };
}

const fmt = (n: number) =>
  Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10);
const plural = (n: number, w: string) => `${fmt(n)} ${w}${Math.round(n) === 1 ? "" : "s"}`;

/**
 * Reason text naming which comparison produced the score. Only says "versus
 * their usual" when the personal comparison actually drove (or shared) it.
 */
export function describeComparison(
  personal: PersonalComparison | null,
  basis: ComparisonBasis,
  what: string,
): string | null {
  if (!personal || basis === "fallback") return null;
  const partly = basis === "blended" ? " (limited history, so also weighed against your other customers)" : "";
  if (personal.kind === "rhythm") {
    return `${plural(personal.current, "day")} since the last ${what} — this customer usually goes about ${plural(personal.normal, "day")} between them${partly}.`;
  }
  const pct = personal.changePct ?? 0;
  const dir = pct === 0 ? "unchanged" : pct > 0 ? `up ${pct}%` : `down ${Math.abs(pct)}%`;
  const head = `${what[0].toUpperCase()}${what.slice(1)} ${dir} in the last 30 days versus this customer's own previous 90 days`;
  // Steady or improving against their own history: any remaining risk comes
  // from the cross-customer comparison, so say that rather than imply a drop.
  if (basis === "blended" && personal.score >= 75) {
    return `${head}; with limited history it's also weighed against your other customers, where it sits lower.`;
  }
  return `${head}${partly}.`;
}
