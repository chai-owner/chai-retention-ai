// Sample rows for the public, no-login demo (`?demo=1`). Signed-in accounts
// never see any of this — they always read their own stored data. These
// builders derive everything from the illustrative sample customer set so the
// demo tables, and the Today brief, line up with the rest of the demo.
import {
  categoryFromHealth,
  daysAgoISO,
  DEFAULT_METRIC_WEIGHTS,
  buildDataset,
  type Customer,
} from "@/lib/mock-data";
import type { SupportRow, TransactionRow } from "@/lib/data-tables.functions";
import type { RiskLevel } from "@/lib/customer-scoring";
import { buildDailyBrief, type SnapshotRow } from "@/lib/daily-brief";
import type { TodayBrief } from "@/lib/daily-brief.functions";

function demoCustomers(): Customer[] {
  return buildDataset(DEFAULT_METRIC_WEIGHTS).customers;
}

function riskOf(health: number): RiskLevel {
  const c = categoryFromHealth(health);
  return c === "healthy" ? "healthy" : c === "critical" ? "critical" : "at-risk";
}

/** Deterministic pseudo-random in [0,1) from a string seed. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function demoTransactions(): TransactionRow[] {
  const rows: TransactionRow[] = [];
  demoCustomers().forEach((c) => {
    const perCustomer = 3;
    for (let i = 0; i < perCustomer; i++) {
      const r = hash01(`${c.id}-tx-${i}`);
      const amount = Math.round(((c.revenue / 12) * (0.6 + r * 0.9)) / 10) * 10;
      const occurred = daysAgoISO(12 + i * 31 + Math.floor(r * 6)).slice(0, 10);
      const due = daysAgoISO(Math.max(0, 12 + i * 31 - 30)).slice(0, 10);
      const unpaid = c.health < 55 && i === 0;
      const overdue = unpaid ? Math.round(8 + r * 45) : 0;
      rows.push({
        id: `${c.id}-tx-${i}`,
        transactionId: `INV-${1000 + rows.length}`,
        customerId: c.id,
        amount,
        occurredAt: occurred,
        dueDate: due,
        amountDue: unpaid ? amount : 0,
        paidDate: unpaid ? null : occurred,
        daysOverdue: overdue,
      });
    }
  });
  return rows.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
}

const SUBJECTS = [
  "Trouble exporting a report",
  "Billing question about last invoice",
  "Feature request: bulk import",
  "Integration keeps disconnecting",
  "Slow dashboard loading",
  "How do I add a teammate?",
  "Renewal terms clarification",
  "Data looks out of date",
];

export function demoSupportTickets(): SupportRow[] {
  const rows: SupportRow[] = [];
  demoCustomers().forEach((c) => {
    const r = hash01(`${c.id}-ticket`);
    const count = c.health < 55 ? 3 : c.health < 75 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const rr = hash01(`${c.id}-ticket-${i}`);
      rows.push({
        id: `${c.id}-tk-${i}`,
        ticketId: `TCK-${2000 + rows.length}`,
        customerId: c.id,
        subject: SUBJECTS[Math.floor(rr * SUBJECTS.length)] ?? SUBJECTS[0]!,
        status: c.health < 55 && i === 0 ? "Open" : rr > 0.6 ? "Pending" : "Resolved",
        createdAt: daysAgoISO(2 + i * 9 + Math.floor(r * 10)),
      });
    }
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Turn a sample customer into the snapshot shape the brief builder expects. */
function snapshotOf(c: Customer, drift = 0): SnapshotRow {
  const score = Math.max(1, Math.min(100, c.health + drift));
  const subs = c.subScores ?? {};
  const breakdown = Object.entries(subs).map(([metric, normalised]) => ({
    metric,
    value: c.metricValues?.[metric] ?? Math.round(normalised),
    normalised,
    weight: DEFAULT_METRIC_WEIGHTS[metric] ?? 3,
    basis: "value" as never,
    baseline: null,
  }));
  return {
    customer_id: c.id,
    score,
    risk_level: riskOf(score),
    score_breakdown: breakdown,
    scored_at: new Date().toISOString(),
  };
}

/** The Today brief for the public demo, built entirely from sample customers. */
export function demoTodayBrief(): TodayBrief {
  const cs = demoCustomers();
  const latest = cs.map((c) => snapshotOf(c));
  // Yesterday: nudge a handful of accounts so the brief shows real movement.
  const previous = cs.map((c, i) =>
    snapshotOf(c, i % 7 === 0 ? 8 : i % 5 === 0 ? -6 : 0),
  );
  const names: Record<string, string> = {};
  for (const c of cs) names[c.id] = c.name;
  const brief = buildDailyBrief({ latest, previous, names });
  return { ...brief, scoredAt: new Date().toISOString() };
}
