import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALESFORCE_INSTANCE_URL,
  normaliseInstanceUrl,
} from "./salesforce.functions";

describe("normaliseInstanceUrl", () => {
  it("defaults to login.salesforce.com when empty", () => {
    expect(normaliseInstanceUrl("")).toBe(DEFAULT_SALESFORCE_INSTANCE_URL);
    expect(normaliseInstanceUrl(undefined)).toBe(DEFAULT_SALESFORCE_INSTANCE_URL);
  });

  it("keeps custom My Domain hosts", () => {
    expect(
      normaliseInstanceUrl("https://orgfarm-937b0e05c6-dev-ed.develop.my.salesforce.com/lightning"),
    ).toBe("https://orgfarm-937b0e05c6-dev-ed.develop.my.salesforce.com");
  });

  it("adds https and strips paths, trailing slashes and whitespace", () => {
    expect(normaliseInstanceUrl("  test.salesforce.com/  ")).toBe("https://test.salesforce.com");
  });

  it("upgrades http to https", () => {
    expect(normaliseInstanceUrl("http://acme.my.salesforce.com")).toBe(
      "https://acme.my.salesforce.com",
    );
  });

  it("throws on invalid input", () => {
    expect(() => normaliseInstanceUrl("ht tp://%%%")).toThrow();
  });
});
