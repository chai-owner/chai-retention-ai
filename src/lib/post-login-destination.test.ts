import { describe, it, expect } from "vitest";
import {
  resolvePostLoginDestination,
  resolveGuardedDestination,
} from "@/lib/post-login-destination";

describe("resolvePostLoginDestination", () => {
  it("sends users who never finished onboarding back into the flow", () => {
    expect(resolvePostLoginDestination(null)).toBe("/onboarding");
    expect(resolvePostLoginDestination({ onboarded: false, unlocked: true })).toBe("/onboarding");
  });

  it("sends onboarded but locked users to welcome", () => {
    expect(resolvePostLoginDestination({ onboarded: true, unlocked: false })).toBe("/app/welcome");
  });

  it("sends onboarded and unlocked users to today", () => {
    expect(resolvePostLoginDestination({ onboarded: true, unlocked: true })).toBe("/app/today");
  });
});

describe("resolveGuardedDestination", () => {
  it("blocks protected pages until onboarding is complete", () => {
    expect(resolveGuardedDestination({ onboarded: false }, "/app/today")).toBe("/onboarding");
    expect(resolveGuardedDestination(null, "/app/customers")).toBe("/onboarding");
  });

  it("lets an unfinished user stay in onboarding", () => {
    expect(resolveGuardedDestination({ onboarded: false }, "/onboarding")).toBeNull();
  });

  it("never keeps a finished user in onboarding", () => {
    expect(resolveGuardedDestination({ onboarded: true, unlocked: true }, "/onboarding")).toBe(
      "/app/today",
    );
    expect(resolveGuardedDestination({ onboarded: true, unlocked: false }, "/onboarding")).toBe(
      "/app/welcome",
    );
  });

  it("keeps locked users on the pages they may use", () => {
    const locked = { onboarded: true, unlocked: false };
    expect(resolveGuardedDestination(locked, "/app/today")).toBe("/app/welcome");
    expect(resolveGuardedDestination(locked, "/app/welcome")).toBeNull();
    expect(resolveGuardedDestination(locked, "/app/data")).toBeNull();
  });

  it("moves unlocked users off the welcome screen", () => {
    expect(resolveGuardedDestination({ onboarded: true, unlocked: true }, "/app/welcome")).toBe(
      "/app/today",
    );
    expect(resolveGuardedDestination({ onboarded: true, unlocked: true }, "/app/today")).toBeNull();
  });

  it("always allows the admin console", () => {
    expect(resolveGuardedDestination({ onboarded: false }, "/admin")).toBeNull();
  });
});
