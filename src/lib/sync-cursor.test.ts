import { describe, it, expect } from "vitest";
import { laggedSinceMs, SEARCH_INDEX_LAG_MS } from "./sync-cursor";

describe("laggedSinceMs", () => {
  it("holds the bookmark back by the search-index lag", () => {
    const since = "2026-09-23T20:00:00.000Z";
    expect(laggedSinceMs(since)).toBe(new Date(since).getTime() - SEARCH_INDEX_LAG_MS);
    expect(SEARCH_INDEX_LAG_MS).toBe(300_000);
  });
  it("returns 0 for missing or invalid bookmarks", () => {
    expect(laggedSinceMs(null)).toBe(0);
    expect(laggedSinceMs(undefined)).toBe(0);
    expect(laggedSinceMs("garbage")).toBe(0);
  });
});
