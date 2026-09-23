// Read-only search + preview for "Forget a customer". Never deletes — the
// deletion itself stays in customer-erasure.server.ts, unchanged.
import { fetchAllPages } from "@/lib/ingest-row-normalize";
import {
  erasureKeysFor,
  findErasureCandidates,
  isPseudonym,
  type CandidateSourceRow,
  type ErasableCustomerRow,
  type ErasureCandidate,
  type ErasurePreview,
} from "@/lib/customer-erasure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function loadBatchSources(db: Db, userId: string): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("ingest_batches").select("id, source_provider").eq("user_id", userId);
  if (error) throw new Error(`ingest_batches: ${error.message}`);
  return new Map((data ?? []).map((b: { id: string; source_provider: string }) => [b.id, b.source_provider]));
}

export async function searchErasureCandidates(
  db: Db, userId: string, query: string,
): Promise<ErasureCandidate[]> {
  const sources = await loadBatchSources(db, userId);
  const customers = (await fetchAllPages(
    (from, to) => db.from("ingested_customers")
      .select("customer_id, data, batch_id, updated_at")
      .eq("user_id", userId).order("id", { ascending: true }).range(from, to) as never,
    "ingested_customers",
  )) as unknown as { customer_id: string; data: Record<string, unknown>; batch_id: string | null; updated_at: string }[];
  const support = (await fetchAllPages(
    (from, to) => db.from("ingested_support")
      .select("customer_id, data, batch_id, created_at")
      .eq("user_id", userId).order("id", { ascending: true }).range(from, to) as never,
    "ingested_support",
  )) as unknown as { customer_id: string | null; data: Record<string, unknown>; batch_id: string | null; created_at: string }[];

  const c: CandidateSourceRow[] = customers.map((r) => ({
    customer_id: r.customer_id, data: r.data,
    source: r.batch_id ? sources.get(r.batch_id) : null, at: r.updated_at,
  }));
  const s: CandidateSourceRow[] = support.map((r) => ({
    customer_id: r.customer_id, data: r.data,
    source: r.batch_id ? sources.get(r.batch_id) : null,
    at: (r.data?.created_date as string) || r.created_at,
  }));
  return findErasureCandidates(c, s, query);
}

async function countIn(db: Db, table: string, userId: string, column: string, keys: string[]) {
  const { count, error } = await db.from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).in(column, keys);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** Counts exactly what eraseCustomerData would delete for this identifier. */
export async function previewErasure(
  db: Db, userId: string, identifier: string,
): Promise<ErasurePreview> {
  const rows = (await fetchAllPages(
    (from, to) => db.from("ingested_customers").select("customer_id, data")
      .eq("user_id", userId).order("id", { ascending: true }).range(from, to) as never,
    "ingested_customers",
  )) as unknown as ErasableCustomerRow[];
  const keys = erasureKeysFor(rows, identifier).filter((k) => !isPseudonym(k));
  const empty: ErasurePreview = {
    keys, customers: 0, transactions: 0, support: 0, usage: 0, surveys: 0,
    aliases: 0, conversations: 0, signals: 0, scores: 0,
  };
  if (keys.length === 0) return empty;
  const [customers, transactions, support, usage, surveys, a1, a2, signals, conversations, scores] =
    await Promise.all([
      countIn(db, "ingested_customers", userId, "customer_id", keys),
      countIn(db, "ingested_transactions", userId, "customer_id", keys),
      countIn(db, "ingested_support", userId, "customer_id", keys),
      countIn(db, "ingested_usage", userId, "customer_id", keys),
      countIn(db, "ingested_surveys", userId, "customer_id", keys),
      countIn(db, "customer_id_aliases", userId, "customer_id", keys),
      countIn(db, "customer_id_aliases", userId, "source_id", keys),
      countIn(db, "content_risk_signals", userId, "customer_ref", keys),
      countIn(db, "content_conversations", userId, "customer_ref", keys),
      countIn(db, "customer_scores", userId, "customer_id", keys),
    ]);
  return { ...empty, customers, transactions, support, usage, surveys,
    aliases: a1 + a2, signals, conversations, scores };
}
