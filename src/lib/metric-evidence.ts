// Evidence rules shared by the customer page (real-scoring.ts) and the nightly
// score (customer-scoring.ts), so thin data never turns into extreme scores.
//
// Rule 1 — per customer: a measure only scores a customer once they have at
// least MIN_CUSTOMER_RECORDS dated records of that kind. Recency ("days since
// last …", "months since …") and single-value fields ("latest") are exempt:
// one record is real evidence for them.
//
// Rule 2 — per measure: a comparison between customers needs at least
// MIN_PEERS customers who pass rule 1. Below that the measure is left out for
// everyone, and switches on by itself once enough customers have data.
import { MIN_NORMAL_RECORDS } from "@/lib/personal-baseline";

export const MIN_CUSTOMER_RECORDS = MIN_NORMAL_RECORDS; // 3
export const MIN_PEERS = 5;

export const NOT_ENOUGH_DATA_LABEL = `Not enough data yet — scored after ${MIN_CUSTOMER_RECORDS} records`;

/** Operations for which a single record is real evidence. */
export function isEvidenceExempt(operation: string | undefined | null): boolean {
  return operation === "days_since_last" || operation === "months_since" || operation === "latest";
}

/** Rule 1: does this customer have enough records for a count/average/rate measure? */
export function hasEnoughRecords(count: number | undefined | null): boolean {
  return (count ?? 0) >= MIN_CUSTOMER_RECORDS;
}

/** Rule 2: are there enough qualifying customers to compare them? */
export function hasEnoughPeers(qualifying: number): boolean {
  return qualifying >= MIN_PEERS;
}

/**
 * Applies both rules to one measure's per-customer values. `recordCounts`
 * holds each customer's dated records of the measure's kind. Exempt
 * operations pass through untouched.
 */
export function applyEvidenceRules(
  values: Map<string, number>,
  recordCounts: Map<string, number>,
  operation: string | undefined | null,
): Map<string, number> {
  if (isEvidenceExempt(operation)) return values;
  const kept = new Map<string, number>();
  for (const [id, v] of values) if (hasEnoughRecords(recordCounts.get(id))) kept.set(id, v);
  return hasEnoughPeers(kept.size) ? kept : new Map();
}

/** Reason text naming the comparison group, shown once a measure is on. */
export function peerNote(peers: number): string {
  return `Compared with ${peers} customers who each have at least ${MIN_CUSTOMER_RECORDS} records.`;
}
