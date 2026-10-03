// Ported verbatim from src/lib/crm-identity.ts.
export function domainEmailHint(website: string): string {
  const raw = (website || "").trim().toLowerCase();
  if (!raw) return "";
  const host = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  return host.includes(".") ? `@${host}` : "";
}
