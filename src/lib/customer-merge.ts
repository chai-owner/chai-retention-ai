// Roster-level deduplication.
//
// customer-matching.ts resolves SIGNAL rows (transactions, tickets, usage) to a
// customer. This module handles the other half of the problem: the customer
// ROSTER itself. When the same company exists in Xero, HubSpot and Zendesk,
// each platform contributes its own customer record with its own id, so the
// roster ends up with three "customers" that are really one.
//
// Duplicates are detected with the same evidence used for signal rows —
// exact contact email, email domain + similar name, or a near-identical
// company name — and confirmed merges are stored in the SAME alias table
// (source, source_id -> master customer_id), so they are applied automatically
// on every future upload and integration refresh.
import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";
import { UNKNOWN_SOURCE } from "@/lib/ingested-data-store";
import { rowSource, aliasKey, type CustomerAlias } from "@/lib/customer-matching";

export interface RosterRecord {
  customer_id: string;
  source: string;
  name: string;
  email: string;
  /** Count of non-empty fields — used to pick the richest record as master. */
  richness: number;
  row: IngestRow;
}

export interface DuplicateGroup {
  /** Suggested master (the richest / most authoritative record). */
  master: RosterRecord;
  /** Other records that look like the same company. */
  members: RosterRecord[];
  reason: string;
  /** 0–1 */
  confidence: number;
}

export interface CustomerIdentity {
  source: string;
  source_id: string;
  /** True for the master record's own id. */
  primary: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();
const nameKey = (s: string) =>
  norm(s)
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|plc|gmbh|pty|group|holdings)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com",
]);

// Which platform's record we trust most as the master profile.
const SOURCE_RANK: Record<string, number> = {
  hubspot: 5,
  salesforce: 5,
  zoho: 5,
  xero: 4,
  quickbooks: 4,
  freshbooks: 4,
  zendesk: 3,
  intercom: 3,
  freshdesk: 3,
  csv: 2,
  upload: 2,
  drop: 2,
};

const EMAIL_FIELDS = ["email", "contact_email", "customer_email", "billing_email"];

function fieldEmail(row: IngestRow): string {
  for (const f of EMAIL_FIELDS) {
    const v = (row[f] || "").trim();
    if (v.includes("@")) return norm(v);
  }
  return "";
}

function fieldName(row: IngestRow): string {
  return (
    row["customer_name"] ||
    row["company"] ||
    row["organization"] ||
    row["account_name"] ||
    row["name"] ||
    ""
  ).trim();
}

function domainOf(email: string): string {
  const d = email.split("@")[1] ?? "";
  return GENERIC_DOMAINS.has(d) ? "" : d;
}

export function rosterRecords(data: IngestedData): RosterRecord[] {
  return (data.customers ?? [])
    .map((row) => ({
      customer_id: (row.customer_id ?? "").trim(),
      source: rowSource(row),
      name: fieldName(row) || (row.customer_id ?? "").trim(),
      email: fieldEmail(row),
      richness: Object.entries(row).filter(([k, v]) => !k.startsWith("__") && (v ?? "").trim())
        .length,
      row,
    }))
    .filter((r) => r.customer_id.length > 0);
}

function betterMaster(a: RosterRecord, b: RosterRecord): RosterRecord {
  const ra = SOURCE_RANK[a.source] ?? 1;
  const rb = SOURCE_RANK[b.source] ?? 1;
  if (ra !== rb) return ra > rb ? a : b;
  if (a.richness !== b.richness) return a.richness > b.richness ? a : b;
  return a.customer_id <= b.customer_id ? a : b;
}

function nameSimilar(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Find clusters of roster records that look like the same company across
 * platforms. Records already merged (or explicitly marked "not a match") via
 * the alias table are skipped.
 */
export function findDuplicateCustomers(
  data: IngestedData,
  aliases: CustomerAlias[] = [],
): DuplicateGroup[] {
  const records = rosterRecords(data);
  if (records.length < 2) return [];

  const decided = new Set(aliases.map((a) => aliasKey(a.source, a.source_id)));
  const open = records.filter((r) => !decided.has(aliasKey(r.source, r.customer_id)));

  // Union-find style clustering over three evidence passes.
  const parent = new Map<string, string>();
  const key = (r: RosterRecord) => aliasKey(r.source, r.customer_id);
  const find = (k: string): string => {
    const p = parent.get(k);
    if (!p || p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const r of open) parent.set(key(r), key(r));

  const reasons = new Map<string, { reason: string; confidence: number }>();
  const noteReason = (a: RosterRecord, b: RosterRecord, reason: string, confidence: number) => {
    const k = find(key(a));
    const prev = reasons.get(k);
    if (!prev || confidence > prev.confidence) reasons.set(k, { reason, confidence });
    union(key(a), key(b));
    const nk = find(key(a));
    const best = reasons.get(k);
    if (best && (!reasons.get(nk) || best.confidence > reasons.get(nk)!.confidence)) {
      reasons.set(nk, best);
    }
  };

  const byEmail = new Map<string, RosterRecord>();
  const byDomain = new Map<string, RosterRecord[]>();
  const byName = new Map<string, RosterRecord>();

  for (const r of open) {
    // Never merge two records that came from the SAME platform — a platform's
    // own ids are already unique within itself.
    if (r.email) {
      const seen = byEmail.get(r.email);
      if (seen && seen.source !== r.source) {
        noteReason(r, seen, `Same contact email (${r.email})`, 1);
      } else if (!seen) byEmail.set(r.email, r);
    }
    const dom = domainOf(r.email);
    if (dom) {
      for (const c of byDomain.get(dom) ?? []) {
        if (c.source !== r.source && nameSimilar(c.name, r.name)) {
          noteReason(r, c, `Same email domain (${dom}) and matching company name`, 0.9);
        }
      }
      byDomain.set(dom, [...(byDomain.get(dom) ?? []), r]);
    }
    const nk = nameKey(r.name);
    if (nk.length >= 4) {
      const seen = byName.get(nk);
      if (seen && seen.source !== r.source) {
        noteReason(r, seen, "Matching company name", 0.75);
      } else if (!seen) byName.set(nk, r);
    }
  }

  const clusters = new Map<string, RosterRecord[]>();
  for (const r of open) {
    const root = find(key(r));
    clusters.set(root, [...(clusters.get(root) ?? []), r]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, members] of clusters) {
    if (members.length < 2) continue;
    let master = members[0]!;
    for (const m of members.slice(1)) master = betterMaster(master, m);
    const meta = reasons.get(root) ?? { reason: "Likely the same company", confidence: 0.7 };
    groups.push({
      master,
      members: members.filter((m) => m !== master),
      reason: meta.reason,
      confidence: meta.confidence,
    });
  }
  return groups.sort((a, b) => b.confidence - a.confidence || b.members.length - a.members.length);
}

/**
 * All platform identities that currently resolve to a customer, using the RAW
 * (pre-merge) roster plus the saved aliases. Powers the identities panel on a
 * customer profile.
 */
export function customerIdentities(
  data: IngestedData,
  aliases: CustomerAlias[],
  customerId: string,
): CustomerIdentity[] {
  const out: CustomerIdentity[] = [];
  const seen = new Set<string>();
  const push = (source: string, source_id: string, primary: boolean) => {
    const k = aliasKey(source, source_id);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ source, source_id, primary });
  };
  for (const r of rosterRecords(data)) {
    if (r.customer_id === customerId) push(r.source, r.customer_id, true);
  }
  for (const a of aliases) {
    if (a.status === "linked" && a.customer_id === customerId) {
      push(a.source || UNKNOWN_SOURCE, a.source_id, false);
    }
  }
  return out.sort((a, b) => Number(b.primary) - Number(a.primary));
}

/**
 * Fold duplicate roster rows into their master record. Fields already present
 * on the master win; blanks are filled from the merged record so nothing is
 * lost. Applied on top of the alias map, so it re-runs automatically on every
 * refresh.
 */
export function mergeRoster(data: IngestedData, aliases: CustomerAlias[]): IngestedData {
  const rows = data.customers ?? [];
  if (!rows.length || !aliases.length) return data;
  const lookup = new Map<string, CustomerAlias>();
  for (const a of aliases) lookup.set(aliasKey(a.source, a.source_id), a);

  const masters = new Map<string, IngestRow>();
  const order: string[] = [];
  const pending: { alias: CustomerAlias; row: IngestRow }[] = [];

  for (const row of rows) {
    const id = (row.customer_id ?? "").trim();
    const alias = lookup.get(aliasKey(rowSource(row), id));
    if (alias && alias.status === "ignored") continue;
    if (alias && alias.customer_id && alias.customer_id !== id) {
      pending.push({ alias, row });
      continue;
    }
    if (!masters.has(id)) order.push(id);
    masters.set(id, masters.get(id) ?? row);
  }

  if (!pending.length) return data;

  for (const { alias, row } of pending) {
    const targetId = alias.customer_id!;
    const master = masters.get(targetId);
    if (!master) {
      // Master record isn't in the roster (yet) — promote the merged row.
      const promoted = { ...row, customer_id: targetId };
      masters.set(targetId, promoted);
      order.push(targetId);
      continue;
    }
    const filled = { ...master };
    for (const [k, v] of Object.entries(row)) {
      if (k === "customer_id" || k.startsWith("__")) continue;
      if (!(filled[k] ?? "").trim() && (v ?? "").trim()) filled[k] = v;
    }
    masters.set(targetId, filled);
  }

  return { ...data, customers: order.map((id) => masters.get(id)!).filter(Boolean) };
}
