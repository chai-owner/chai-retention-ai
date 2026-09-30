import { describe, it, expect } from "vitest";
import { normaliseSearch, matchesSearch, searchSuggestions, paginate } from "./section-search";

describe("search normalisation", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normaliseSearch("Maple-Works, Inc.")).toBe("mapleworksinc");
    expect(matchesSearch("maple works", ["MapleWorks Software"])).toBe(true);
    expect(matchesSearch("WORKS soft", ["MapleWorks Software"])).toBe(true);
    expect(matchesSearch("acme", ["MapleWorks Software"])).toBe(false);
  });
  it("matches any field and treats empty query as match-all", () => {
    expect(matchesSearch("sn-0030", ["Other", "SN 0030"])).toBe(true);
    expect(matchesSearch("  ", ["x"])).toBe(true);
  });
});

describe("auto-complete", () => {
  const names = Array.from({ length: 20 }, (_, i) => `Maple ${i}`);
  it("returns at most 8 and nothing under 2 characters", () => {
    expect(searchSuggestions("ma", names)).toHaveLength(8);
    expect(searchSuggestions("m", names)).toEqual([]);
  });
  it("dedupes by normalised value", () => {
    expect(searchSuggestions("ac", ["Acme", "ACME", "a.c.m.e"])).toEqual(["Acme"]);
  });
});

describe("pagination", () => {
  const items = Array.from({ length: 35 }, (_, i) => i);
  it("handles boundaries", () => {
    expect(paginate(items, 1)).toMatchObject({ start: 1, end: 10, total: 35, pageCount: 4 });
    expect(paginate(items, 4)).toMatchObject({ start: 31, end: 35, page: 4 });
    expect(paginate(items, 99).page).toBe(4);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ start: 0, end: 0, total: 0, pageCount: 1 });
    expect(paginate(items.slice(0, 10), 1).pageCount).toBe(1);
  });
  it("reaches every item exactly once across pages", () => {
    const { pageCount } = paginate(items, 1);
    const seen = Array.from({ length: pageCount }, (_, p) => paginate(items, p + 1).items).flat();
    expect(seen).toEqual(items);
  });
  it("search resets to page 1 (filtered list paged from 1)", () => {
    // The hook sets page=1 on every query change; the pure equivalent:
    const filtered = items.filter((i) => matchesSearch("3", [String(i)]));
    expect(paginate(filtered, 1).start).toBe(1);
  });
});
