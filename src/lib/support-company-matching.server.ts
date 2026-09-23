// Server side of support → company matching: load what's needed, compute the
// auto links (pure, see support-company-matching.ts) and save them. Existing
// aliases — manual links, earlier auto links and "not a match" markers — are
// never overwritten: inserts use ON CONFLICT DO NOTHING.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { CustomerAlias } from "@/lib/customer-matching";
import { findSupportAutoLinks, type AutoLink } from "@/lib/support-company-matching";
import {
  INGEST_COLUMNS,
  batchSource,
  fetchAllPages,
  normalizeIngestRow,
} from "@/lib/ingest-row-normalize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export async function loadAliases(db: Db, userId: string): Promise<CustomerAlias[]> {
  const { data, error } = await db
    .from("customer_id_aliases")
    .select("source, source_id, customer_id, status, match_method, match_reason")
    .eq("user_id", userId);
  if (error) throw new Error(`customer_id_aliases: ${error.message}`);
  return (data ?? []).map((r) => ({
    source: (r.source as string) || "unknown",
    source_id: r.source_id as string,
    customer_id: (r.customer_id as string | null) ?? null,
    status: r.status === "ignored" ? "ignored" : "linked",
    method: (r.match_method as string | null) ?? null,
    reason: (r.match_reason as string | null) ?? null,
  }));
}

/** Save auto links; returns the ones actually inserted (already-saved ids are skipped). */
export async function saveAutoLinks(db: Db, userId: string, links: AutoLink[]): Promise<AutoLink[]> {
  if (links.length === 0) return [];
  const { data, error } = await db
    .from("customer_id_aliases")
    .upsert(
      links.map((l) => ({
        user_id: userId,
        source: l.source,
        source_id: l.source_id,
        customer_id: l.customer_id,
        status: "linked",
        match_method: l.method,
        match_reason: l.reason.slice(0, 300),
      })),
      { onConflict: "user_id,source,source_id", ignoreDuplicates: true },
    )
    .select("source, source_id");
  if (error) throw new Error(`customer_id_aliases: ${error.message}`);
  const inserted = new Set((data ?? []).map((r) => `${r.source}::${r.source_id}`));
  return links.filter((l) => inserted.has(`${l.source}::${l.source_id}`));
}

/**
 * Compute and save auto links against already-loaded data. Returns the full
 * alias list including anything just added, ready for applyAliases.
 */
export async function autoLinkWithData(
  db: Db,
  userId: string,
  data: IngestedData,
  aliases: CustomerAlias[],
): Promise<{ aliases: CustomerAlias[]; added: AutoLink[] }> {
  const added = await saveAutoLinks(db, userId, findSupportAutoLinks(data, aliases));
  return {
    added,
    aliases: [
      ...aliases,
      ...added.map((l) => ({
        source: l.source,
        source_id: l.source_id,
        customer_id: l.customer_id,
        status: "linked" as const,
        method: l.method,
        reason: l.reason,
      })),
    ],
  };
}

/** Standalone entry point (after a support sync): loads customers + tickets itself. */
export async function autoLinkSupportRequesters(db: Db, userId: string): Promise<AutoLink[]> {
  const [customers, support, batches, aliases] = await Promise.all([
    fetchAllPages(
      (from, to) =>
        db
          .from("ingested_customers")
          .select("id, data, customer_id, batch_id")
          .eq("user_id", userId)
          .order("id")
          .range(from, to),
      "ingested_customers",
    ),
    fetchAllPages(
      (from, to) =>
        db
          .from("ingested_support")
          .select("id, data, ticket_id, customer_id, batch_id")
          .eq("user_id", userId)
          .order("id")
          .range(from, to),
      "ingested_support",
    ),
    db
      .from("ingest_batches")
      .select("id, source_kind, source_provider")
      .eq("user_id", userId)
      .then((r) => (r.data ?? []) as Array<{ id: string; source_kind: string; source_provider: string }>),
    loadAliases(db, userId),
  ]);
  const src = new Map(batches.map((b) => [b.id, batchSource(b.source_kind, b.source_provider)]));
  const norm = (rows: Record<string, unknown>[], key: string) =>
    rows.map((r) =>
      normalizeIngestRow(r, INGEST_COLUMNS[key]!, src.get(String(r["batch_id"] ?? "")) ?? undefined),
    );
  const data: IngestedData = {
    customers: norm(customers, "customers"),
    support: norm(support, "support"),
  };
  const { added } = await autoLinkWithData(db, userId, data, aliases);
  return added;
}
