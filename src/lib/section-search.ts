// Pure search + pagination helpers for the Identity Resolution sections.

export const SECTION_PAGE_SIZE = 10;
export const SUGGESTION_LIMIT = 8;
export const MIN_SUGGEST_CHARS = 2;

/** Lowercase and strip spaces/punctuation: "Maple Works!" -> "mapleworks". */
export function normaliseSearch(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** True when any field contains the query (normalised, anywhere). Empty query matches all. */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const q = normaliseSearch(query);
  if (!q) return true;
  return fields.some((f) => normaliseSearch(f).includes(q));
}

/** Up to `limit` distinct candidate strings matching the query; none below 2 characters. */
export function searchSuggestions(
  query: string,
  candidates: Array<string | null | undefined>,
  limit = SUGGESTION_LIMIT,
): string[] {
  const q = normaliseSearch(query);
  if (q.length < MIN_SUGGEST_CHARS) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const key = normaliseSearch(c);
    if (!key || seen.has(key) || !key.includes(q)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function pageCountFor(total: number, pageSize = SECTION_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Items on a 1-based page, with the page clamped to range. */
export function paginate<T>(items: T[], page: number, pageSize = SECTION_PAGE_SIZE) {
  const pageCount = pageCountFor(items.length, pageSize);
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const from = (safePage - 1) * pageSize;
  const slice = items.slice(from, from + pageSize);
  return {
    items: slice,
    page: safePage,
    pageCount,
    start: items.length ? from + 1 : 0,
    end: from + slice.length,
    total: items.length,
  };
}
