// Scoring for the content-signal validation gate.
//
// Thresholds are the ones agreed in the phased plan: precision weighted above
// recall, because a wrong flag on a healthy account costs more than a miss.
import { SIGNAL_TYPES, type SignalType } from "./test-set";

export const DIRECT_SIGNALS: SignalType[] = ["competitor_mentioned", "cancellation_intent"];
export const CIRCUMSTANTIAL_SIGNALS: SignalType[] = ["champion_departure", "company_distress"];

export interface GateThreshold {
  precision: number;
  recall: number;
  /** Max false positives per 100 conversations. */
  fpPer100: number;
}

export const GATE: Record<"direct" | "circumstantial", GateThreshold> = {
  direct: { precision: 0.9, recall: 0.7, fpPer100: 2 },
  circumstantial: { precision: 0.75, recall: 0.5, fpPer100: 5 },
};

export interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

export interface SignalMetrics extends Counts {
  precision: number;
  recall: number;
  fpPer100: number;
}

export function emptyCounts(): Counts {
  return { tp: 0, fp: 0, fn: 0 };
}

export function tally(
  cases: Array<{ truth: SignalType[]; predicted: SignalType[] }>,
): Record<SignalType, Counts> {
  const out = {} as Record<SignalType, Counts>;
  for (const s of SIGNAL_TYPES) out[s] = emptyCounts();
  for (const c of cases) {
    for (const s of SIGNAL_TYPES) {
      const t = c.truth.includes(s);
      const p = c.predicted.includes(s);
      if (t && p) out[s].tp += 1;
      else if (!t && p) out[s].fp += 1;
      else if (t && !p) out[s].fn += 1;
    }
  }
  return out;
}

export function metricsFor(counts: Counts, conversationCount: number): SignalMetrics {
  const precision = counts.tp + counts.fp === 0 ? 1 : counts.tp / (counts.tp + counts.fp);
  const recall = counts.tp + counts.fn === 0 ? 1 : counts.tp / (counts.tp + counts.fn);
  const fpPer100 = conversationCount === 0 ? 0 : (counts.fp / conversationCount) * 100;
  return { ...counts, precision, recall, fpPer100 };
}

export function combine(list: Counts[]): Counts {
  return list.reduce(
    (acc, c) => ({ tp: acc.tp + c.tp, fp: acc.fp + c.fp, fn: acc.fn + c.fn }),
    emptyCounts(),
  );
}

export function passesGate(m: SignalMetrics, t: GateThreshold): boolean {
  return m.precision >= t.precision && m.recall >= t.recall && m.fpPer100 <= t.fpPer100;
}
