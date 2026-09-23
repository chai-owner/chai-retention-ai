// Search-backed incremental syncs (HubSpot Search, Intercom conversation
// search) are eventually consistent: a record changed seconds before a sync
// can be missing from the search index at that moment. If the bookmark then
// moves past it, it is never picked up. Holding the cursor back a few minutes
// re-reads that window every run; re-fetched records upsert in place, so the
// overlap never creates duplicates.
export const SEARCH_INDEX_LAG_MS = 5 * 60 * 1000;

/** Bookmark in epoch ms, held back by the search-index lag. */
export function laggedSinceMs(since: string | null | undefined): number {
  const ms = since ? new Date(since).getTime() : 0;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(0, ms - SEARCH_INDEX_LAG_MS);
}
