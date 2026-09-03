import { describe, it, expect } from "vitest";
import { rangeFor, showingRange, clampPage, pageSlice } from "./pagination";

describe("rangeFor", () => {
  it("maps page 1 to an inclusive zero-based range", () => {
    expect(rangeFor(1, 50)).toEqual([0, 49]);
  });
  it("offsets later pages by the page size", () => {
    expect(rangeFor(3, 100)).toEqual([200, 299]);
  });
  it("treats invalid pages as page 1", () => {
    expect(rangeFor(0, 50)).toEqual([0, 49]);
    expect(rangeFor(-4, 50)).toEqual([0, 49]);
    expect(rangeFor(NaN, 50)).toEqual([0, 49]);
  });
});

describe("showingRange", () => {
  it("reports the visible slice", () => {
    expect(showingRange(2, 50, 120)).toEqual({ start: 51, end: 100, total: 120, pageCount: 3 });
  });
  it("clips the final page to the total", () => {
    expect(showingRange(3, 50, 120)).toEqual({ start: 101, end: 120, total: 120, pageCount: 3 });
  });
  it("is empty when there are no rows", () => {
    expect(showingRange(1, 50, 0)).toEqual({ start: 0, end: 0, total: 0, pageCount: 0 });
  });
  it("clamps a page beyond the end", () => {
    expect(showingRange(99, 50, 60).start).toBe(51);
  });
});

describe("clampPage", () => {
  it("clamps below and above", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});

describe("pageSlice", () => {
  const rows = Array.from({ length: 130 }, (_, i) => i);
  it("returns a full page", () => {
    expect(pageSlice(rows, 2, 50)).toEqual(rows.slice(50, 100));
  });
  it("returns the remainder on the last page", () => {
    expect(pageSlice(rows, 3, 50)).toHaveLength(30);
  });
});
