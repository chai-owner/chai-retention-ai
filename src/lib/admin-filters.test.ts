import { describe, expect, it } from "vitest";
import { canDeleteAccount, matchesPlan, matchesSearch } from "@/lib/admin-filters";

describe("matchesSearch", () => {
  const row = { fullName: "Rebekah Doty", email: "rd@example.com", company: "Faker Gym" };

  it("matches an empty term", () => {
    expect(matchesSearch(row, "  ")).toBe(true);
  });

  it("matches name, email and company case-insensitively", () => {
    expect(matchesSearch(row, "rebek")).toBe(true);
    expect(matchesSearch(row, "EXAMPLE.COM")).toBe(true);
    expect(matchesSearch(row, "gym")).toBe(true);
  });

  it("rejects non-matches", () => {
    expect(matchesSearch(row, "zzz")).toBe(false);
  });
});

describe("matchesPlan", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("passes everything for 'all'", () => {
    expect(matchesPlan({ plan: null, trialEndsAt: null }, "all", now)).toBe(true);
  });

  it("filters by plan name", () => {
    expect(matchesPlan({ plan: "standard", trialEndsAt: null }, "standard", now)).toBe(true);
    expect(matchesPlan({ plan: "core", trialEndsAt: null }, "standard", now)).toBe(false);
  });

  it("treats only future trial dates as trialing", () => {
    expect(
      matchesPlan({ plan: "standard", trialEndsAt: "2026-01-20T00:00:00Z" }, "trial", now),
    ).toBe(true);
    expect(
      matchesPlan({ plan: "standard", trialEndsAt: "2026-01-01T00:00:00Z" }, "trial", now),
    ).toBe(false);
    expect(matchesPlan({ plan: "core", trialEndsAt: null }, "trial", now)).toBe(false);
  });
});

describe("canDeleteAccount", () => {
  it("allows only empty, non-onboarded accounts", () => {
    expect(canDeleteAccount({ onboarded: false, customerCount: 0 })).toBe(true);
    expect(canDeleteAccount({ onboarded: true, customerCount: 0 })).toBe(false);
    expect(canDeleteAccount({ onboarded: false, customerCount: 4 })).toBe(false);
  });
});
