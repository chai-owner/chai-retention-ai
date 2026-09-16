// Pure pagination helpers shared by the server-side paged reads and the
// table UI. Kept free of server imports so components can use them safely.

/** Convert a 1-based page number into an inclusive Supabase `.range()` pair. */
export function rangeFor(page: number, pageSize: number): [number, number] {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const from = (safePage - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** "Showing X–Y of Z" numbers for a page of results. */
export function showingRange(page: number, pageSize: number, total: number) {
  if (total <= 0) return { start: 0, end: 0, total: 0, pageCount: 0 };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  return { start, end, total, pageCount };
}

/** Clamp a page number coming from the URL. */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  if (pageCount > 0 && page > pageCount) return pageCount;
  return Math.floor(page);
}

/** Client-side slice used by the live-scoring fallback path. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const [from] = rangeFor(page, pageSize);
  return rows.slice(from, from + pageSize);
}
