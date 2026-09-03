// Server-side paginated reads for the app's data tables.
//
// These deliberately use Supabase `.range(from, to)` with an exact count so a
// page renders one slice of rows rather than hydrating the whole account.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INGEST_COLUMNS, normalizeIngestRow } from "@/lib/ingest-row-normalize";
import { rangeFor } from "@/lib/pagination";

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

    let query = supabase
      .from("customer_scores")
      .select("customer_id, score, risk_level", { count: "exact" })
      .eq("user_id", userId)
      .eq("is_latest", true);
    if (data.risk && data.risk !== "all") query = query.eq("risk_level", data.risk);

    // Lowest health score first == highest risk first, matching the live view.
    const { data: scores, count, error } = await query
      .order("score", { ascending: true })
      .order("customer_id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);

    const rows = scores ?? [];
    if (rows.length === 0) {
      // Distinguish "no snapshot at all" from "this page is past the end".
      const { count: anySnapshot } = await supabase
        .from("customer_scores")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_latest", true);
      return { rows: [], total: count ?? 0, hasSnapshot: (anySnapshot ?? 0) > 0 };
    }

    const ids = rows.map((r) => r.customer_id);
    const { data: customers } = await supabase
      .from("ingested_customers")
      .select("customer_id, data")
      .eq("user_id", userId)
      .in("customer_id", ids);

    const byId = new Map<string, Record<string, string>>();
    for (const c of customers ?? []) {
      byId.set(
        c.customer_id,
        normalizeIngestRow(c as Record<string, unknown>, INGEST_COLUMNS.customers!),
      );
    }

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
        };
      }),
      total: count ?? rows.length,
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
