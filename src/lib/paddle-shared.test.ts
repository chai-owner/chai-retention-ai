import { describe, expect, it } from "vitest";

import {
  planForProduct,
  planPeriodForPrice,
  planChangeKind,
  pendingChangeDue,
  PLAN_PRICE_IDS,
  PRODUCT_TO_PLAN,
  ADDON_PRODUCT_ID,
  ADDON_PRICE_ID,
} from "@/lib/paddle-shared";

describe("plan/product mappings", () => {
  it("maps every plan product to its plan", () => {
    expect(planForProduct("chai_core")).toBe("core");
    expect(planForProduct("chai_standard")).toBe("standard");
    expect(planForProduct("chai_enterprise")).toBe("enterprise");
    expect(planForProduct(ADDON_PRODUCT_ID)).toBeNull();
    expect(planForProduct("unknown_product")).toBeNull();
  });

  it("maps every plan price to plan and billing period", () => {
    expect(planPeriodForPrice(PLAN_PRICE_IDS.core.monthly)).toEqual({
      plan: "core",
      period: "monthly",
    });
    expect(planPeriodForPrice(PLAN_PRICE_IDS.enterprise.annual)).toEqual({
      plan: "enterprise",
      period: "annual",
    });
    expect(planPeriodForPrice(ADDON_PRICE_ID)).toBeNull();
  });

  it("has unique price IDs across plans and periods", () => {
    const ids = Object.values(PRODUCT_TO_PLAN).flatMap((plan) => [
      PLAN_PRICE_IDS[plan].monthly,
      PLAN_PRICE_IDS[plan].annual,
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("planChangeKind", () => {
  it("treats moving up a tier as an immediate upgrade", () => {
    expect(planChangeKind("core", "standard")).toBe("upgrade-now");
    expect(planChangeKind("standard", "enterprise")).toBe("upgrade-now");
    expect(planChangeKind("core", "enterprise")).toBe("upgrade-now");
  });

  it("treats moving down a tier as a downgrade at renewal", () => {
    expect(planChangeKind("enterprise", "standard")).toBe("downgrade-renewal");
    expect(planChangeKind("standard", "core")).toBe("downgrade-renewal");
    expect(planChangeKind("enterprise", "core")).toBe("downgrade-renewal");
  });

  it("treats same-tier billing-period switches as no plan change", () => {
    expect(planChangeKind("core", "core")).toBe("same");
    expect(planChangeKind("standard", "standard")).toBe("same");
  });
});

describe("pendingChangeDue", () => {
  const now = new Date("2026-09-03T12:00:00Z");

  it("is due once the effective time has passed", () => {
    expect(pendingChangeDue("2026-09-03T11:59:59Z", now)).toBe(true);
    expect(pendingChangeDue("2026-09-01T00:00:00Z", now)).toBe(true);
  });

  it("is not due before the effective time", () => {
    expect(pendingChangeDue("2026-09-03T12:00:01Z", now)).toBe(false);
    expect(pendingChangeDue("2026-10-01T00:00:00Z", now)).toBe(false);
  });

  it("is not due without an effective time", () => {
    expect(pendingChangeDue(null, now)).toBe(false);
    expect(pendingChangeDue(undefined, now)).toBe(false);
  });
});
