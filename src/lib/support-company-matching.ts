// Support ticket → customer company matching.
//
// Support tools (Zendesk, Intercom, Freshdesk) identify the PERSON who opened a
// ticket; the customer roster is usually COMPANIES (from a CRM or accounting
// tool). This module decides which requesters can be linked to a company
// automatically, in priority order:
//
//   1. Saved link (manual or earlier auto link, or "not a match")  — never touched
//   2. Email domain → exactly one customer with that domain        — auto link
//   3. Support-tool organisation name → exactly one customer name  — auto link
//   4. Anything else stays unmatched for a person to link by hand
//
// Auto links are written to the same alias table as manual ones, tagged with
// match_method so a person can see why and undo them (undo = "not a match",
// which also stops the link being re-created).
//
// Pure — no network, no database.
import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";
import { aliasKey, rowSource, type CustomerAlias } from "@/lib/customer-matching";

export type AutoMatchMethod = "auto_domain" | "auto_organisation";

export interface AutoLink {
  source: string;
  source_id: string;
  customer_id: string;
  method: AutoMatchMethod;
  reason: string;
}

export const SUPPORT_SOURCES = new Set(["zendesk", "intercom", "freshdesk"]);

/** Free / personal mailbox domains — never evidence of which company someone works for. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "web.de",
  "mail.com",
  "zoho.com",
  "zohomail.com",
  "yandex.com",
  "yandex.ru",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
  "qq.com",
  "163.com",
]);

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Company-name key: lower-case, legal suffixes and punctuation removed. */
export function companyKey(s: string): string {
  return norm(s)
    .replace(/&/g, " and ")
    .replace(
      /\b(inc|incorporated|llc|llp|ltd|limited|corp|corporation|co|company|plc|gmbh|pty|ag|sa|bv|group|holdings)\b\.?/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, "");
}

/** Bare host from an email, "@domain" hint, URL or plain domain; "" if none. */
export function domainFrom(value: string): string {
  let v = norm(value);
  if (!v) return "";
  if (v.includes("@")) v = v.split("@").pop() ?? "";
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0] ?? "";
  return v.includes(".") ? v : "";
}

/** Business domain for an email address; "" for personal mailboxes. */
export function businessDomain(email: string): string {
  const d = domainFrom(email);
  return d && !PERSONAL_EMAIL_DOMAINS.has(d) ? d : "";
}

const CUSTOMER_DOMAIN_FIELDS = [
  "email",
  "contact_email",
  "billing_email",
  "customer_email",
  "domain",
  "website",
];
const REQUESTER_EMAIL_FIELDS = ["email", "requester_email", "customer_email", "contact_email"];
const ORG_FIELDS = ["company", "organization", "organisation"];

function customerName(row: IngestRow): string {
  return (row["name"] || row["customer_name"] || row["company"] || "").trim();
}

function first(row: IngestRow, fields: string[]): string {
  for (const f of fields) {
    const v = (row[f] ?? "").trim();
    if (v) return v;
  }
  return "";
}

/**
 * Work out which unmatched support requesters can be linked to a customer
 * automatically. Only requesters that are (a) from a support tool, (b) not
 * already a customer id, and (c) have no saved alias of any kind are considered.
 * A requester whose tickets disagree (different domains/orgs pointing at
 * different companies) is left alone.
 */
export function findSupportAutoLinks(
  data: IngestedData,
  aliases: CustomerAlias[],
): AutoLink[] {
  const customers = (data.customers ?? []).filter((r) => (r.customer_id ?? "").trim());
  if (customers.length === 0) return [];

  const knownIds = new Set(customers.map((r) => (r.customer_id ?? "").trim()));
  const byDomain = new Map<string, Set<string>>();
  const byName = new Map<string, Set<string>>();
  const nameOf = new Map<string, string>();
  for (const row of customers) {
    const id = (row.customer_id ?? "").trim();
    nameOf.set(id, customerName(row) || id);
    for (const f of CUSTOMER_DOMAIN_FIELDS) {
      const d = domainFrom(row[f] ?? "");
      if (!d || PERSONAL_EMAIL_DOMAINS.has(d)) continue;
      if (!byDomain.has(d)) byDomain.set(d, new Set());
      byDomain.get(d)!.add(id);
    }
    const k = companyKey(customerName(row));
    if (k.length >= 3) {
      if (!byName.has(k)) byName.set(k, new Set());
      byName.get(k)!.add(id);
    }
  }

  const saved = new Set(aliases.map((a) => aliasKey(a.source, a.source_id)));
  const candidates = new Map<string, AutoLink | null>();

  for (const row of data.support ?? []) {
    const source = rowSource(row);
    if (!SUPPORT_SOURCES.has(source)) continue;
    const raw = (row.customer_id ?? "").trim();
    if (!raw || knownIds.has(raw)) continue;
    const key = aliasKey(source, raw);
    if (saved.has(key)) continue;

    let link: AutoLink | null = null;
    const email = first(row, REQUESTER_EMAIL_FIELDS);
    const dom = businessDomain(email);
    const domHits = dom ? byDomain.get(dom) : undefined;
    if (domHits && domHits.size === 1) {
      const id = [...domHits][0]!;
      link = {
        source,
        source_id: raw,
        customer_id: id,
        method: "auto_domain",
        reason: `Email domain ${dom} matches ${nameOf.get(id)}`,
      };
    } else if (!domHits || domHits.size === 0) {
      // Domain is ambiguous (2+ companies) → stop; don't let a name guess override it.
      const org = first(row, ORG_FIELDS);
      const k = companyKey(org);
      const nameHits = k.length >= 3 ? byName.get(k) : undefined;
      if (nameHits && nameHits.size === 1) {
        const id = [...nameHits][0]!;
        link = {
          source,
          source_id: raw,
          customer_id: id,
          method: "auto_organisation",
          reason: `${source === "zendesk" ? "Zendesk" : "Support"} organisation "${org}" matches ${nameOf.get(id)}`,
        };
      }
    }

    if (!candidates.has(key)) {
      candidates.set(key, link);
    } else {
      const prev = candidates.get(key);
      // Tickets from the same requester disagree → leave it for a person.
      if (link && prev && prev.customer_id !== link.customer_id) candidates.set(key, null);
      else if (link && !prev) candidates.set(key, link);
    }
  }

  return [...candidates.values()].filter((l): l is AutoLink => l !== null);
}
