// Cross-platform customer identity resolution.
//
// Every incoming row carries the platform it came from (`__source`, set at
// ingest time) plus whatever customer reference that platform uses. Zendesk
// user "4471" and Xero contact "c1f2-…" can be the same company — and two
// platforms can reuse the same raw number for DIFFERENT companies — so an
// identity is always the pair (source, source_id), never the id alone.
//
// Resolution order for an incoming reference:
//   1. saved link for that platform's id  (silent)
//   2. exact id / trimmed-case id match   (silent)
//   3. exact contact email match          (auto-linkable)
//   4. email domain + similar name        (suggestion)
//   5. similar name or id                 (suggestion)
//
// Pure helpers over the in-memory ingested store — no network, no demo data.
import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";
import { SOURCE_FIELD, UNKNOWN_SOURCE } from "@/lib/ingested-data-store";

export type AliasStatus = "linked" | "ignored";

export interface CustomerAlias {
  /** Platform the raw id came from: zendesk, xero, hubspot, csv, … */
  source: string;
  source_id: string;
  customer_id: string | null;
  status: AliasStatus;
}

export interface CustomerOption {
  customer_id: string;
  name: string;
  email?: string;
}

export interface Suggestion {
  customer_id: string;
  name: string;
  reason: string;
  /** 0–1; 1 means an exact match once trimmed/lower-cased. */
  confidence: number;
  /** Safe to link without asking (exact id or exact email match). */
  auto?: boolean;
}

export interface UnmatchedGroup {
  /** The raw customer_id value found on the rows. */
  sourceId: string;
  /** Platform the rows came from. */
  source: string;
  /** Row counts per dataset key, e.g. { transactions: 12, usage: 4 }. */
  counts: Record<string, number>;
  total: number;
  suggestions: Suggestion[];
  /** True when a simple trim/case fix resolves it to a real customer. */
  trivial: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Human label for a platform tag. */
const SOURCE_LABELS: Record<string, string> = {
  zendesk: "Zendesk",
  intercom: "Intercom",
  freshdesk: "Freshdesk",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  zoho: "Zoho CRM",
  quickbooks: "QuickBooks",
  freshbooks: "FreshBooks",
  xero: "Xero",
  csv: "CSV upload",
  upload: "CSV upload",
  drop: "ChAi data drop",
  [UNKNOWN_SOURCE]: "Unknown source",
};

export function sourceLabel(source: string): string {
  if (!source) return SOURCE_LABELS[UNKNOWN_SOURCE]!;
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** Heading for the identity panel: only "connected" once there is more than one. */
export function identityCardTitle(count: number): string {
  return count > 1 ? "Connected identities" : "Customer identity";
}

/** Identity key: a raw id only means something together with its platform. */
export function aliasKey(source: string, sourceId: string): string {
  return `${source || UNKNOWN_SOURCE}::${sourceId}`;
}

export function rowSource(row: IngestRow): string {
  return (row[SOURCE_FIELD] || "").trim() || UNKNOWN_SOURCE;
}

const EMAIL_FIELDS = [
  "email",
  "contact_email",
  "customer_email",
  "requester_email",
  "billing_email",
];

function rowEmail(row: IngestRow): string {
  for (const f of EMAIL_FIELDS) {
    const v = (row[f] || "").trim();
    if (v.includes("@")) return norm(v);
  }
  return "";
}

function rowName(row: IngestRow): string {
  return (
    row["customer_name"] ||
    row["company"] ||
    row["organization"] ||
    row["account_name"] ||
    row["name"] ||
    ""
  ).trim();
}

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com",
]);

function domainOf(email: string): string {
  const d = email.split("@")[1] ?? "";
  return GENERIC_DOMAINS.has(d) ? "" : d;
}

export function customerOptions(data: IngestedData): CustomerOption[] {
  return (data.customers ?? [])
    .map((r) => ({
      customer_id: (r.customer_id ?? "").trim(),
      name: (r.customer_name || r.name || r.company || r.customer_id || "").trim(),
      email: (r.email || r.contact_email || "").trim() || undefined,
    }))
    .filter((c) => c.customer_id.length > 0);
}

// Cheap token/substring similarity good enough for "did you mean" suggestions.
function similarity(a: string, b: string): number {
  const x = norm(a).replace(/[^a-z0-9]+/g, " ").trim();
  const y = norm(b).replace(/[^a-z0-9]+/g, " ").trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  const xt = new Set(x.split(" ").filter((t) => t.length > 2));
  const yt = new Set(y.split(" ").filter((t) => t.length > 2));
  if (!xt.size || !yt.size) return 0;
  let hits = 0;
  for (const t of xt) if (yt.has(t)) hits++;
  return hits / Math.max(xt.size, yt.size);
}

/** Dataset keys that reference a customer (everything except the roster). */
export function signalDatasetKeys(data: IngestedData): string[] {
  return Object.keys(data).filter((k) => k !== "customers" && (data[k] ?? []).length > 0);
}

/**
 * Legacy aliases were stored without a platform. Match them by id alone so
 * previously confirmed links keep resolving.
 */
function aliasLookup(aliases: CustomerAlias[]) {
  const exact = new Map<string, CustomerAlias>();
  const legacy = new Map<string, CustomerAlias>();
  for (const a of aliases) {
    exact.set(aliasKey(a.source, a.source_id), a);
    if (!a.source || a.source === UNKNOWN_SOURCE) legacy.set(a.source_id, a);
  }
  return (source: string, id: string) => exact.get(aliasKey(source, id)) ?? legacy.get(id);
}

/**
 * Fill in `customer_id` for signal rows that only carry an email or a company
 * name. Exact email match wins, then an exact (normalized) name match against
 * the roster. When nothing matches we stamp a stable placeholder id
 * (`email:…` / `name:…`) so the row still groups in Identity Resolution — and
 * can be linked once — instead of being silently dropped.
 */
export function resolveIdentities(data: IngestedData): IngestedData {
  const customers = customerOptions(data);
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of customers) {
    const e = norm(c.email ?? "");
    if (e.includes("@") && !byEmail.has(e)) byEmail.set(e, c.customer_id);
    const n = norm(c.name).replace(/[^a-z0-9]+/g, " ").trim();
    if (n && !byName.has(n)) byName.set(n, c.customer_id);
  }

  const out: IngestedData = { ...data };
  for (const key of Object.keys(data)) {
    if (key === "customers") continue;
    const rows = data[key] ?? [];
    let changed = false;
    const next: IngestRow[] = rows.map((row) => {
      if ((row.customer_id ?? "").trim()) return row;
      const email = rowEmail(row);
      const name = rowName(row);
      let id = "";
      if (email) id = byEmail.get(email) ?? "";
      if (!id && name) id = byName.get(norm(name).replace(/[^a-z0-9]+/g, " ").trim()) ?? "";
      if (!id && email) id = `email:${email}`;
      if (!id && name) id = `name:${name}`;
      if (!id) return row;
      changed = true;
      return { ...row, customer_id: id };
    });
    if (changed) out[key] = next;
  }
  return out;
}

/** Human label for a placeholder id created by `resolveIdentities`. */
export function identifierLabel(sourceId: string): string {
  if (sourceId.startsWith("email:")) return `email ${sourceId.slice(6)}`;
  if (sourceId.startsWith("name:")) return `name "${sourceId.slice(5)}"`;
  return `ID ${sourceId}`;
}

export function findUnmatched(
  data: IngestedData,
  aliases: CustomerAlias[] = [],
): UnmatchedGroup[] {
  const customers = customerOptions(data);
  if (customers.length === 0) return [];
  const known = new Set(customers.map((c) => c.customer_id));
  const knownNorm = new Map<string, string>();
  for (const c of customers) knownNorm.set(norm(c.customer_id), c.customer_id);
  const byEmail = new Map<string, CustomerOption>();
  const byDomain = new Map<string, CustomerOption[]>();
  for (const c of customers) {
    const e = norm(c.email ?? "");
    if (!e.includes("@")) continue;
    if (!byEmail.has(e)) byEmail.set(e, c);
    const d = domainOf(e);
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), c]);
  }

  const resolved = aliasLookup(aliases);

  const groups = new Map<string, UnmatchedGroup>();
  for (const key of signalDatasetKeys(data)) {
    for (const row of data[key] ?? []) {
      const raw = row.customer_id ?? "";
      if (!raw) continue;
      if (known.has(raw)) continue;
      const source = rowSource(row);
      if (resolved(source, raw)) continue;
      const gk = aliasKey(source, raw);
      let g = groups.get(gk);
      if (!g) {
        const hit = knownNorm.get(norm(raw));
        const suggestions: Suggestion[] = [];
        const seen = new Set<string>();
        const push = (s: Suggestion) => {
          if (seen.has(s.customer_id)) return;
          seen.add(s.customer_id);
          suggestions.push(s);
        };
        if (hit) {
          push({
            customer_id: hit,
            name: customers.find((c) => c.customer_id === hit)?.name ?? hit,
            reason: "Same ID after trimming spaces / casing",
            confidence: 1,
            auto: true,
          });
        }
        // Exact contact email — the only signal strong enough to auto-link
        // an id that looks nothing like the customer's own id.
        const email = rowEmail(row);
        const emailHit = email ? byEmail.get(email) : undefined;
        if (emailHit) {
          push({
            customer_id: emailHit.customer_id,
            name: emailHit.name,
            reason: `Same email address (${email})`,
            confidence: 1,
            auto: true,
          });
        }
        // Email domain + similar company name — strong, but always confirmed.
        const dom = email ? domainOf(email) : "";
        const name = rowName(row);
        if (dom) {
          for (const c of byDomain.get(dom) ?? []) {
            const score = name ? similarity(name, c.name) : 0.6;
            push({
              customer_id: c.customer_id,
              name: c.name,
              reason: `Same email domain (${dom})${name && score >= 0.5 ? " and similar name" : ""}`,
              confidence: Math.max(0.7, Math.min(0.95, score)),
            });
          }
        }
        for (const c of customers) {
          const score = Math.max(
            similarity(raw, c.name),
            similarity(raw, c.customer_id),
            name ? similarity(name, c.name) : 0,
            c.email ? similarity(raw, c.email.split("@")[0] ?? "") : 0,
          );
          if (score >= 0.5) {
            push({
              customer_id: c.customer_id,
              name: c.name,
              reason: "Similar name or ID",
              confidence: score,
            });
          }
        }
        suggestions.sort((a, b) => b.confidence - a.confidence);
        g = {
          sourceId: raw,
          source,
          counts: {},
          total: 0,
          suggestions: suggestions.slice(0, 4),
          trivial: Boolean(hit),
        };
        groups.set(gk, g);
      }
      g.counts[key] = (g.counts[key] ?? 0) + 1;
      g.total++;
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/** Groups whose top suggestion is safe to link without asking. */
export function autoLinkable(groups: UnmatchedGroup[]): UnmatchedGroup[] {
  return groups.filter((g) => g.suggestions[0]?.auto);
}

/**
 * Rewrite every non-customer row's `customer_id` through the alias map so the
 * scoring engine sees a single canonical id per customer, regardless of which
 * platform the row came from. Rows aliased to "ignored" are dropped.
 */
export function applyAliases(data: IngestedData, aliases: CustomerAlias[]): IngestedData {
  if (!aliases.length) return data;
  const lookup = aliasLookup(aliases);
  const out: IngestedData = { ...data };
  for (const key of Object.keys(data)) {
    if (key === "customers") continue;
    const rows = data[key] ?? [];
    let changed = false;
    const next: IngestRow[] = [];
    for (const row of rows) {
      const alias = lookup(rowSource(row), row.customer_id ?? "");
      if (!alias) {
        next.push(row);
        continue;
      }
      changed = true;
      if (alias.status === "ignored" || !alias.customer_id) continue;
      next.push({ ...row, customer_id: alias.customer_id });
    }
    if (changed) out[key] = next;
  }
  return out;
}

export const DATASET_LABELS: Record<string, string> = {
  transactions: "transactions",
  usage: "usage rows",
  support: "support tickets",
  surveys: "survey responses",
};

export function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([k, n]) => `${n} ${DATASET_LABELS[k] ?? k.replace(/^metric_/, "").replace(/_/g, " ") + " rows"}`)
    .join(" · ");
}

/**
 * Count how many rows each saved alias is currently resolving, using the RAW
 * (pre-alias) ingested data. Keyed by `aliasKey(source, source_id)`.
 */
export function countAliasUsage(
  data: IngestedData,
  aliases: CustomerAlias[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!aliases.length) return out;
  const lookup = aliasLookup(aliases);
  for (const key of signalDatasetKeys(data)) {
    for (const row of data[key] ?? []) {
      const raw = row.customer_id ?? "";
      if (!raw) continue;
      const alias = lookup(rowSource(row), raw);
      if (!alias) continue;
      const bucket = (out[aliasKey(alias.source, alias.source_id)] ??= {});
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
  }
  return out;
}

/** Build a single-group payload so the wizard can re-run on one saved link. */
export function groupForSourceId(
  data: IngestedData,
  sourceId: string,
  counts: Record<string, number>,
  source: string = UNKNOWN_SOURCE,
): UnmatchedGroup {
  const customers = customerOptions(data);
  const hit = customers.find((c) => norm(c.customer_id) === norm(sourceId));
  return {
    sourceId,
    source,
    counts,
    total: Object.values(counts).reduce((s, n) => s + n, 0),
    trivial: Boolean(hit),
    suggestions: hit
      ? [
          {
            customer_id: hit.customer_id,
            name: hit.name,
            reason: "Same ID after trimming spaces / casing",
            confidence: 1,
            auto: true,
          },
        ]
      : [],
  };
}
