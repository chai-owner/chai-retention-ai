import { describe, expect, it } from "vitest";
import {
  cellIssue,
  countRowIssues,
  customerKeyForRow,
  rowHasIdentity,
  rowHasIssue,
  validateFormat,
} from "./row-validation";

const fields = [
  { name: "customer_id", example: "CUS-1" },
  { name: "name", example: "Acme Corp" },
  { name: "email", example: "ops@acme.com" },
  { name: "signup_date", example: "2024-01-01", mandatory: true },
];

const idx = { id: 0, name: 1, email: 2, date: 3 };
const row = (id: string, name: string, email: string, date = "2024-01-01") => [id, name, email, date];

describe("identifier group validation", () => {
  it("accepts id + name, blank email", () => {
    const r = row("12345", "Acme Corp", "");
    expect(rowHasIdentity(fields, r)).toBe(true);
    expect(cellIssue(fields, r, idx.email)).toBeNull();
    expect(rowHasIssue(fields, r)).toBe(false);
  });

  it("accepts name only", () => {
    const r = row("", "Acme Corp", "");
    expect(rowHasIssue(fields, r)).toBe(false);
    expect(cellIssue(fields, r, idx.id)).toBeNull();
    expect(cellIssue(fields, r, idx.email)).toBeNull();
  });

  it("accepts email only", () => {
    const r = row("", "", "customer@acme.com");
    expect(rowHasIssue(fields, r)).toBe(false);
    expect(cellIssue(fields, r, idx.name)).toBeNull();
  });

  it("accepts id + email, blank name", () => {
    const r = row("12345", "", "customer@acme.com");
    expect(rowHasIssue(fields, r)).toBe(false);
  });

  it("rejects a row with all three identifiers blank", () => {
    const r = row("", "", "");
    expect(rowHasIdentity(fields, r)).toBe(false);
    expect(cellIssue(fields, r, idx.id)).toMatch(/at least one/);
    expect(cellIssue(fields, r, idx.name)).toMatch(/at least one/);
    expect(cellIssue(fields, r, idx.email)).toMatch(/at least one/);
    expect(countRowIssues(fields, [r])).toBe(3);
  });

  it("still validates a supplied email's format", () => {
    const r = row("12345", "Acme", "not-an-email");
    expect(cellIssue(fields, r, idx.email)).toMatch(/email/);
  });

  it("keeps required checks on genuinely required non-identity fields", () => {
    const r = row("12345", "Acme", "", "");
    expect(cellIssue(fields, r, idx.date)).toBe("required");
  });

  it("regression: deleting the email does not invalidate the row", () => {
    const before = row("12345", "Acme Corp", "ops@acme.com");
    expect(rowHasIssue(fields, before)).toBe(false);
    const after = [...before];
    after[idx.email] = "";
    expect(cellIssue(fields, after, idx.email)).toBeNull();
    expect(rowHasIssue(fields, after)).toBe(false);
    // ...and still fine when only the name remains
    const nameOnly = [...after];
    nameOnly[idx.id] = "";
    expect(rowHasIssue(fields, nameOnly)).toBe(false);
  });

  it("datasets without identifier columns are unaffected", () => {
    const f = [{ name: "amount", example: "10", mandatory: true }];
    expect(rowHasIdentity(f, ["10"])).toBe(true);
    expect(cellIssue(f, [""], 0)).toBe("required");
  });

  it("format validation ignores blanks", () => {
    expect(validateFormat("email", "")).toBeNull();
    expect(validateFormat("number", "12.5")).toBeNull();
    expect(validateFormat("date", "2024-13-99")).not.toBeNull();
  });
});

describe("customerKeyForRow", () => {
  it("prefers customer_id", () => {
    expect(customerKeyForRow({ customer_id: "12345", email: "a@b.com" })).toBe("12345");
  });
  it("derives from email when id is missing", () => {
    expect(customerKeyForRow({ email: "Ops@Acme.com" })).toBe("email:ops@acme.com");
  });
  it("derives from name when id and email are missing", () => {
    expect(customerKeyForRow({ name: "Acme  Corp" })).toBe("name:acme corp");
    expect(customerKeyForRow({ customer_name: "Acme Corp" })).toBe("name:acme corp");
  });
  it("returns null when all identifiers are blank", () => {
    expect(customerKeyForRow({ customer_id: "", name: "", email: "" })).toBeNull();
  });
});
