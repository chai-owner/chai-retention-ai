// Server-side paginated reads for the app's data tables.
//
// These deliberately use Supabase `.range(from, to)` with an exact count so a
// page renders one slice of rows rather than hydrating the whole account.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INGEST_COLUMNS, normalizeIngestRow } from "@/lib/ingest-row-normalize";
import { rangeFor } from "@/lib/pagination";
import type { ChurnMetaEntry, ScoreBreakdownEntry } from "@/lib/customer-scoring";
import { snapshotHasEvidence, splitSnapshotRows } from "@/lib/customer-score-snapshot";

export const CUSTOMER_PAGE_SIZE = 50;
export const TRANSACTION_PAGE_SIZE = 100;
export const SUPPORT_PAGE_SIZE = 50;

const PageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500),
});

const CustomerPageInput = PageInput.extend({
  // Optional risk filter, matching the risk levels written by the daily job.
  risk: z.string().optional(),
});

export interface CustomerRiskRow {
  id: string;
  name: string;
  segment: string;
  health: number;
  riskLevel: string;
  revenue: number;
  /** Saved score had no measures behind it — shown as "Not enough data yet". */
  notEnoughData?: boolean;
}

export interface CustomerRiskPage {
  rows: CustomerRiskRow[];
  total: number;
  /** False when the nightly scoring job hasn't produced a snapshot yet. */
  hasSnapshot: boolean;
}

function pick(data: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function toNumber(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ---- Customer risk table --------------------------------------------------

export const listCustomerRiskPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CustomerPageInput.parse(v))
  .handler(async ({ data, context }): Promise<CustomerRiskPage> => {
    const { supabase, userId } = context;
    const [from, to] = rangeFor(data.page, data.pageSize);

    const { data: all, error } = await supabase
      .from("customer_scores")
      .select("customer_id, score, risk_level, score_breakdown")
      .eq("user_id", userId)
      .eq("is_latest", true)
      .limit(5000);
    if (error) throw new Error(error.message);
    const latest = all ?? [];
    if (latest.length === 0) return { rows: [], total: 0, hasSnapshot: false };

    // Saved scores with no measures behind them are ignored: those customers
    // are listed last as "Not enough data yet" (only in the unfiltered view).
    const split = splitSnapshotRows(latest);
    if (split.scored.length === 0) return { rows: [], total: 0, hasSnapshot: false };
    const ordered = [
      ...split.scored
        .filter((r) => !data.risk || data.risk === "all" || r.risk_level === data.risk)
        .sort((a, b) => Number(a.score) - Number(b.score) || a.customer_id.localeCompare(b.customer_id)),
      ...(!data.risk || data.risk === "all" ? split.unscored : []),
    ];
    const rows = ordered.slice(from, to + 1);
    if (rows.length === 0) return { rows: [], total: ordered.length, hasSnapshot: true };

    const ids = rows.map((r) => r.customer_id);
    const { data: customers } = await supabase
      .from("ingested_customers")
      .select("customer_id, data")
      .eq("user_id", userId)
      .eq("paused", false)
      .in("customer_id", ids);

    const byId = new Map<string, Record<string, string>>();
    for (const c of customers ?? []) {
      byId.set(
        c.customer_id,
        normalizeIngestRow(c as Record<string, unknown>, INGEST_COLUMNS.customers!),
      );
    }
    const unscored = new Set(split.unscored.map((r) => r.customer_id));

    return {
      rows: rows.map((r) => {
        const d = byId.get(r.customer_id) ?? {};
        return {
          id: r.customer_id,
          name: pick(d, ["name", "customer_name", "company", "account_name", "email"]) || r.customer_id,
          segment: pick(d, ["segment", "plan", "tier", "industry"]),
          health: Math.round(Number(r.score) || 0),
          riskLevel: r.risk_level,
          revenue: toNumber(pick(d, ["revenue", "mrr", "arr", "contract_value", "amount"])),
          ...(unscored.has(r.customer_id) ? { notEnoughData: true } : {}),
        };
      }),
      total: ordered.length,
      hasSnapshot: true,
    };
  });

// ---- Transactions table ---------------------------------------------------

export interface TransactionRow {
  id: string;
  transactionId: string;
  customerId: string;
  amount: number | null;
  occurredAt: string | null;
  dueDate: string | null;
  amountDue: number | null;
  paidDate: string | null;
  daysOverdue: number | null;
}

export const listTransactionsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PageInput.parse(v))
  .handler(async ({ data, context }): Promise<{ rows: TransactionRow[]; total: number }> => {
    const { supabase, userId } = context;
    const [from, to] = rangeFor(data.page, data.pageSize);
    const { data: rows, count, error } = await supabase
      .from("ingested_transactions")
      .select(
        "id, transaction_id, customer_id, amount, occurred_at, due_date, amount_due, paid_date, days_overdue",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        transactionId: r.transaction_id,
        customerId: r.customer_id ?? "",
        amount: r.amount,
        occurredAt: r.occurred_at,
        dueDate: r.due_date,
        amountDue: r.amount_due,
        paidDate: r.paid_date,
        daysOverdue: r.days_overdue,
      })),
      total: count ?? 0,
    };
  });

// ---- Support tickets table ------------------------------------------------

export interface SupportRow {
  id: string;
  ticketId: string;
  customerId: string;
  subject: string;
  status: string;
  createdAt: string;
}

export const listSupportPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PageInput.parse(v))
  .handler(async ({ data, context }): Promise<{ rows: SupportRow[]; total: number }> => {
    const { supabase, userId } = context;
    const [from, to] = rangeFor(data.page, data.pageSize);
    const { data: rows, count, error } = await supabase
      .from("ingested_support")
      .select("id, ticket_id, customer_id, data, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r) => {
        const d = normalizeIngestRow(r as Record<string, unknown>, INGEST_COLUMNS.support!);
        return {
          id: r.id,
          ticketId: r.ticket_id,
          customerId: r.customer_id ?? "",
          subject: pick(d, ["subject", "title", "summary", "description"]),
          status: pick(d, ["status", "state", "ticket_status"]),
          createdAt: r.created_at,
        };
      }),
      total: count ?? 0,
    };
  });

// ---- Single customer score snapshot ---------------------------------------

export interface CustomerScoreSnapshot {
  customerId: string;
  score: number;
  riskLevel: string;
  scoredAt: string;
  breakdown: Array<ScoreBreakdownEntry | ChurnMetaEntry>;
}

/**
 * Latest stored score for one customer. Returns null when the nightly scoring
 * job has not produced a snapshot for this customer yet, so the caller can fall
 * back to real-time client-side scoring.
 */
export const getCustomerScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ customerId: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }): Promise<CustomerScoreSnapshot | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("customer_scores")
      .select("customer_id, score, risk_level, score_breakdown, scored_at")
      .eq("user_id", userId)
      .eq("customer_id", data.customerId)
      .eq("is_latest", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    // A saved score with no measures behind it is ignored; the page falls
    // back to the live calculation (which may say "Not enough data yet").
    if (!snapshotHasEvidence(row.score_breakdown)) return null;
    return {
      customerId: row.customer_id,
      score: Math.round(Number(row.score) || 0),
      riskLevel: row.risk_level,
      scoredAt: row.scored_at,
      breakdown: (Array.isArray(row.score_breakdown)
        ? row.score_breakdown
        : []) as unknown as Array<ScoreBreakdownEntry | ChurnMetaEntry>,
    };
  });

export interface PausedCustomerRow {
  customerId: string;
  name: string;
  email: string;
}

/**
 * Customers held back by the plan's customer limit. Their data is intact —
 * they're simply excluded from scoring and the app until an upgrade.
 */
export const listPausedCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: PausedCustomerRow[]; total: number }> => {
    const { supabase, userId } = context;
    const { data, count } = await supabase
      .from("ingested_customers")
      .select("customer_id, data", { count: "exact" })
      .eq("user_id", userId)
      .eq("paused", true)
      .order("customer_id", { ascending: true })
      .range(0, 199);

    const rows = (data ?? []).map((row) => {
      const normalized = normalizeIngestRow(
        row as Record<string, unknown>,
        INGEST_COLUMNS.customers!,
      );
      return {
        customerId: row.customer_id as string,
        name: normalized["name"] ?? (row.customer_id as string),
        email: normalized["email"] ?? "",
      };
    });
    return { rows, total: count ?? rows.length };
  });
