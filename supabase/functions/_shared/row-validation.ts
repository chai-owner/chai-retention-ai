// Ported verbatim (the parts sync-persist.ts needs) from src/lib/row-validation.ts.
export function customerKeyForRow(row: Record<string, unknown>): string | null {
  const id = String(row["customer_id"] ?? "").trim();
  if (id) return id;
  const email = String(row["email"] ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(row["name"] ?? row["customer_name"] ?? "").trim().toLowerCase();
  if (name) return `name:${name.replace(/\s+/g, " ")}`;
  return null;
}
