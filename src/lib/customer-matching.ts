// Detects rows whose `customer_id` doesn't match any customer record, groups
// them by the raw id they carry, and suggests likely customers to link them to.
// Pure helpers over the in-memory ingested store — no network, no demo data.
import type { IngestedData, IngestRow } from "@/lib/ingested-data-store";

export type AliasStatus = "linked" | "ignored";

export interface CustomerAlias {
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
}

export interface UnmatchedGroup {
  /** The raw customer_id value found on the rows. */
  sourceId: string;
  /** Row counts per dataset key, e.g. { transactions: 12, usage: 4 }. */
  counts: Record<string, number>;
  total: number;
  suggestions: Suggestion[];
  /** True when a simple trim/case fix resolves it to a real customer. */
  trivial: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

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

export function findUnmatched(
  data: IngestedData,
  aliases: CustomerAlias[] = [],
): UnmatchedGroup[] {
  const customers = customerOptions(data);
  if (customers.length === 0) return [];
  const known = new Set(customers.map((c) => c.customer_id));
  const knownNorm = new Map<string, string>();
  for (const c of customers) knownNorm.set(norm(c.customer_id), c.customer_id);

  const resolved = new Set(aliases.map((a) => a.source_id));

  const groups = new Map<string, UnmatchedGroup>();
  for (const key of signalDatasetKeys(data)) {
    for (const row of data[key] ?? []) {
      const raw = row.customer_id ?? "";
      if (!raw) continue;
      if (known.has(raw)) continue;
      if (resolved.has(raw)) continue;
      let g = groups.get(raw);
      if (!g) {
        const hit = knownNorm.get(norm(raw));
        const suggestions: Suggestion[] = [];
        if (hit) {
          suggestions.push({
            customer_id: hit,
            name: customers.find((c) => c.customer_id === hit)?.name ?? hit,
            reason: "Same ID after trimming spaces / casing",
            confidence: 1,
          });
        }
        for (const c of customers) {
          if (c.customer_id === hit) continue;
          const score = Math.max(
            similarity(raw, c.name),
            similarity(raw, c.customer_id),
            c.email ? similarity(raw, c.email.split("@")[0] ?? "") : 0,
          );
          if (score >= 0.5) {
            suggestions.push({
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
          counts: {},
          total: 0,
          suggestions: suggestions.slice(0, 4),
          trivial: Boolean(hit),
        };
        groups.set(raw, g);
      }
      g.counts[key] = (g.counts[key] ?? 0) + 1;
      g.total++;
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/**
 * Rewrite every non-customer row's `customer_id` through the alias map so the
 * scoring engine sees a single canonical id per customer. Rows aliased to
 * "ignored" are dropped from scoring inputs.
 */
export function applyAliases(data: IngestedData, aliases: CustomerAlias[]): IngestedData {
  if (!aliases.length) return data;
  const map = new Map(aliases.map((a) => [a.source_id, a]));
  const out: IngestedData = { ...data };
  for (const key of Object.keys(data)) {
    if (key === "customers") continue;
    const rows = data[key] ?? [];
    let changed = false;
    const next: IngestRow[] = [];
    for (const row of rows) {
      const alias = map.get(row.customer_id ?? "");
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
 * (pre-alias) ingested data. Returns a map of source_id -> per-dataset counts.
 */
export function countAliasUsage(
  data: IngestedData,
  aliases: CustomerAlias[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!aliases.length) return out;
  const wanted = new Set(aliases.map((a) => a.source_id));
  for (const key of signalDatasetKeys(data)) {
    for (const row of data[key] ?? []) {
      const raw = row.customer_id ?? "";
      if (!wanted.has(raw)) continue;
      const bucket = (out[raw] ??= {});
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
): UnmatchedGroup {
  const customers = customerOptions(data);
  const hit = customers.find((c) => norm(c.customer_id) === norm(sourceId));
  return {
    sourceId,
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
          },
        ]
      : [],
  };
}
