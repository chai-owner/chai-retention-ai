// Shared row validation for every import path (CSV upload, ChAi Data Drop,
// CRM sync, accounting sync). The key business rule lives here:
//
//   customer_id, name / customer_name and email form ONE identifier group.
//   A row is valid when ANY of them is present, and invalid only when all
//   three are blank. They are never individually required.
//
// Format checks still apply to whatever values ARE supplied (a supplied email
// must look like an email), and genuinely required non-identity fields keep
// their required check.

export type FieldType = "date" | "number" | "email" | "text";

/** Every column name that counts as a customer identifier. */
export const IDENTITY_FIELD_NAMES = [
  "customer_id",
  "name",
  "customer_name",
  "email",
] as const;

export function isIdentityFieldName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return (IDENTITY_FIELD_NAMES as readonly string[]).includes(n);
}

export function inferFieldType(name: string, example = ""): FieldType {
  const n = name.toLowerCase();
  if (n.includes("email")) return "email";
  if (n.includes("date")) return "date";
  if (/^\d+(\.\d+)?$/.test((example || "").trim())) return "number";
  if (/(amount|revenue|score|logins|minutes|features_used|price|qty|quantity|count)/.test(n))
    return "number";
  return "text";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Format-only validation. Blank is always fine here. */
export function validateFormat(type: FieldType, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  switch (type) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, "")) ? null : "expected a number";
    case "date":
      return DATE_RE.test(v) && !isNaN(Date.parse(v)) ? null : "expected YYYY-MM-DD";
    case "email":
      return EMAIL_RE.test(v) ? null : "expected an email";
    default:
      return null;
  }
}

export interface ValidatableField {
  name: string;
  example?: string;
  mandatory?: boolean;
}

function valueAt(fields: ValidatableField[], row: (string | undefined)[], name: string): string {
  const i = fields.findIndex((f) => f.name.toLowerCase() === name);
  return i === -1 ? "" : (row[i] ?? "").trim();
}

/** True when the row carries at least one usable customer identifier. */
export function rowHasIdentity(
  fields: ValidatableField[],
  row: (string | undefined)[],
): boolean {
  const present = IDENTITY_FIELD_NAMES.some(
    (n) => valueAt(fields, row, n).length > 0,
  );
  // Datasets with no identifier columns at all can't fail the identity rule.
  const hasIdentityColumns = fields.some((f) => isIdentityFieldName(f.name));
  return !hasIdentityColumns || present;
}

/** True when the row object (header -> value) carries an identifier. */
export function objectHasIdentity(row: Record<string, unknown>): boolean {
  return IDENTITY_FIELD_NAMES.some(
    (n) => String(row[n] ?? "").trim().length > 0,
  );
}

/**
 * Stable customer key for a row: the supplied customer_id when present,
 * otherwise a deterministic key derived from email or name so rows identified
 * by name/email alone still persist. Never invents data. Returns null when the
 * row has no identifier at all.
 */
export function customerKeyForRow(row: Record<string, unknown>): string | null {
  const id = String(row["customer_id"] ?? "").trim();
  if (id) return id;
  const email = String(row["email"] ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(row["name"] ?? row["customer_name"] ?? "").trim().toLowerCase();
  if (name) return `name:${name.replace(/\s+/g, " ")}`;
  return null;
}

/**
 * Validation message for one cell, derived entirely from the row's current
 * values (never from stale state).
 *
 * - Identity columns: only flagged when EVERY identity column in the row is
 *   blank. A blank email next to a populated customer_id/name is fine.
 * - Other mandatory columns: flagged when blank.
 * - Any supplied value: format-checked.
 */
export function cellIssue(
  fields: ValidatableField[],
  row: (string | undefined)[],
  colIndex: number,
): string | null {
  const field = fields[colIndex];
  if (!field) return null;
  const raw = (row[colIndex] ?? "").trim();
  if (raw !== "") return validateFormat(inferFieldType(field.name, field.example ?? ""), raw);

  if (isIdentityFieldName(field.name)) {
    return rowHasIdentity(fields, row)
      ? null
      : "provide at least one of customer_id, name or email";
  }
  return field.mandatory ? "required" : null;
}

/** Count of validation issues across a set of rows. */
export function countRowIssues(
  fields: ValidatableField[],
  rows: (string | undefined)[][],
): number {
  let count = 0;
  for (const r of rows) {
    for (let ci = 0; ci < fields.length; ci++) {
      if (cellIssue(fields, r, ci)) count++;
    }
  }
  return count;
}

/** True when any cell in the row has a validation issue. */
export function rowHasIssue(
  fields: ValidatableField[],
  row: (string | undefined)[],
): boolean {
  return fields.some((_, ci) => cellIssue(fields, row, ci) !== null);
}
