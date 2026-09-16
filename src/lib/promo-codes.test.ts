import { describe, expect, it } from "vitest";

import {
  FOUNDER_CODE,
  isFounderCode,
  normalisePromoCode,
  validatePromoCode,
} from "@/lib/promo-codes";

describe("promo codes", () => {
  it("normalises casing and whitespace", () => {
    expect(normalisePromoCode("  8akbv6y1bn ")).toBe(FOUNDER_CODE);
  });

  it("accepts the founder code in any casing", () => {
    expect(isFounderCode("8akbv6y1bn")).toBe(true);
    expect(validatePromoCode(" 8AKBV6Y1BN")).toBe(FOUNDER_CODE);
  });

  it("rejects anything else", () => {
    expect(isFounderCode("FOUNDER")).toBe(false);
    expect(isFounderCode(null)).toBe(false);
    expect(validatePromoCode("8AKBV6Y1B")).toBeNull();
  });
});
