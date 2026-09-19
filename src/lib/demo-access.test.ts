import { describe, expect, it } from "vitest";
import {
  clientIpFrom,
  DEMO_RATE_LIMIT_PER_HOUR,
  demoTokenExpiry,
  generateDemoToken,
  isDemoRateLimited,
  isDemoTokenExpired,
  validateDemoLead,
} from "./demo-access";

describe("validateDemoLead", () => {
  it("accepts a complete lead and trims values", () => {
    const res = validateDemoLead({
      name: " Alex ",
      email: " alex@company.com ",
      company: " Northwind ",
      website: "",
    });
    expect(res).toEqual({
      ok: true,
      value: { name: "Alex", email: "alex@company.com", company: "Northwind", website: null },
    });
  });

  it("rejects missing fields and bad emails", () => {
    expect(validateDemoLead({ name: "A", email: "a@b.com" }).ok).toBe(false);
    expect(validateDemoLead({ name: "A", email: "nope", company: "C" }).ok).toBe(false);
  });
});

describe("demo tokens", () => {
  it("mints unguessable, unique tokens", () => {
    const a = generateDemoToken();
    const b = generateDemoToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("expires only after the TTL", () => {
    const expiry = demoTokenExpiry(new Date(0));
    expect(isDemoTokenExpired(expiry, 60_000)).toBe(false);
    expect(isDemoTokenExpired(expiry, expiry.getTime() + 1)).toBe(true);
    expect(isDemoTokenExpired(null)).toBe(true);
    expect(isDemoTokenExpired("not-a-date")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("allows up to the hourly cap then blocks", () => {
    expect(isDemoRateLimited(DEMO_RATE_LIMIT_PER_HOUR - 1)).toBe(false);
    expect(isDemoRateLimited(DEMO_RATE_LIMIT_PER_HOUR)).toBe(true);
  });

  it("reads the caller IP from proxy headers", () => {
    expect(clientIpFrom(new Headers({ "cf-connecting-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).toBe("5.6.7.8");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
