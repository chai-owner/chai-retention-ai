// Pure helpers for the "Forget a customer" erasure flow.
//
// The shape of the guarantee: every row that describes the person is deleted,
// while their scoring history stays behind under a pseudonym so aggregate
// trends (how many accounts were at risk last month, average health over time)
// don't silently change when someone exercises a right-to-be-forgotten request.

export interface ErasableCustomerRow {
  customer_id: string | null;
  data: Record<string, unknown> | null;
}

export const ERASED_PREFIX = "erased-";

/** Case/whitespace-insensitive comparison key for an identifier. */
export function normaliseIdentifier(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Identifier columns a stored customer row may carry. */
const IDENTITY_KEYS = ["customer_id", "name", "customer_name", "email"] as const;

/**
 * True when a stored customer row is the person named by `identifier`.
 * Matches on the stored key or on any identity field inside the row's data,
 * so "Customer ID or email" in the UI is honest.
 */
export function customerRowMatches(row: ErasableCustomerRow, identifier: string): boolean {
  const want = normaliseIdentifier(identifier);
  if (!want) return false;
  if (normaliseIdentifier(row.customer_id) === want) return true;
  const data = row.data ?? {};
  return IDENTITY_KEYS.some((k) => normaliseIdentifier(data[k]) === want);
}

/**
 * Stored customer keys to erase for an identifier. The identifier itself is
 * always included so rows in transaction/support/usage/survey tables that
 * reference a customer with no customer record are still removed.
 */
export function erasureKeysFor(
  rows: ErasableCustomerRow[],
  identifier: string,
): string[] {
  const keys = new Set<string>();
  const raw = String(identifier ?? "").trim();
  if (raw) keys.add(raw);
  for (const row of rows) {
    if (customerRowMatches(row, identifier) && row.customer_id) keys.add(row.customer_id);
  }
  return [...keys];
}

/** Already-erased rows must never be re-pseudonymised on a second pass. */
export function isPseudonym(key: string): boolean {
  return String(key ?? "").startsWith(ERASED_PREFIX);
}

/**
 * Stable, non-reversible replacement id. Deterministic per workspace so every
 * score row for the same person collapses onto one pseudonymous series, and
 * salted with the workspace id so the same customer in two workspaces does not
 * share an id.
 */
export async function pseudonymFor(userId: string, key: string): Promise<string> {
  if (isPseudonym(key)) return key;
  const bytes = new TextEncoder().encode(`${userId}:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${ERASED_PREFIX}${hex.slice(0, 12)}`;
}

export interface ErasureCounts {
  customers: number;
  transactions: number;
  support: number;
  usage: number;
  surveys: number;
  aliases: number;
  scoresAnonymised: number;
}

export function totalDeleted(counts: ErasureCounts): number {
  return (
    counts.customers +
    counts.transactions +
    counts.support +
    counts.usage +
    counts.surveys +
    counts.aliases
  );
}

/** Plain-language summary for the confirmation toast. */
export function describeErasure(counts: ErasureCounts): string {
  const deleted = totalDeleted(counts);
  if (deleted === 0 && counts.scoresAnonymised === 0) {
    return "No records matched that ID or email — nothing was deleted.";
  }
  const parts: string[] = [`${deleted} record${deleted === 1 ? "" : "s"} deleted`];
  if (counts.scoresAnonymised > 0) {
    parts.push(
      `${counts.scoresAnonymised} score${counts.scoresAnonymised === 1 ? "" : "s"} anonymised so trends stay intact`,
    );
  }
  return `${parts.join(", ")}.`;
}
