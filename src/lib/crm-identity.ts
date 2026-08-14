// Shared identity helpers for CRM syncs.
//
// CRMs often expose only a company website/domain, not a contact email. We keep
// the bare domain (prefixed with "@") so email-domain matching in Identity
// Resolution still has something to work with, without inventing an address.
export function domainEmailHint(website: string): string {
  const raw = (website || "").trim().toLowerCase();
  if (!raw) return "";
  const host = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  return host.includes(".") ? `@${host}` : "";
}
