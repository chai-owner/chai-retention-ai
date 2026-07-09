// In-memory store of support ticket records, keyed by ticket_id. Powers the
// "Ticket status changes" section on the Data Quality page. On upload, tickets
// are merged: existing tickets are overwritten when their status changes, and
// every status change is logged with a timestamp so we can measure how long a
// ticket took to close. Uses useSyncExternalStore so every screen stays in sync.
import { useSyncExternalStore } from "react";

export interface StatusChange {
  status: string;
  at: string; // when this status was recorded (upload time, or created_date for the first entry)
}

export interface TicketRecord {
  ticket_id: string;
  customer_id: string;
  created_date: string;
  status: string;
  category: string;
  satisfaction_score: string;
  history: StatusChange[];
  closedAt?: string; // upload timestamp when the ticket flipped to a closing status
  resolutionHours?: number; // created_date -> closedAt, in hours
}

export interface MergeSummary {
  inserted: number;
  updated: number;
  closed: number;
  reopened: number;
  avgResolutionHours: number | null;
}

const CLOSING_STATUSES = new Set(["resolved", "closed"]);

function isClosing(status: string) {
  return CLOSING_STATUSES.has(status.trim().toLowerCase());
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function hoursBetween(from: string, to: string): number {
  const start = new Date(from.replace(" ", "T")).getTime();
  const end = new Date(to.replace(" ", "T")).getTime();
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, Math.round(((end - start) / 3600000) * 10) / 10);
}

function daysAgoStamp(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

let tickets: TicketRecord[] = [
  {
    ticket_id: "TKT-5480",
    customer_id: "CUS-1001",
    created_date: daysAgoStamp(12).slice(0, 10),
    status: "resolved",
    category: "Billing",
    satisfaction_score: "4",
    history: [
      { status: "open", at: daysAgoStamp(12) },
      { status: "in_progress", at: daysAgoStamp(9) },
      { status: "resolved", at: daysAgoStamp(7) },
    ],
    closedAt: daysAgoStamp(7),
    resolutionHours: hoursBetween(daysAgoStamp(12), daysAgoStamp(7)),
  },
  {
    ticket_id: "TKT-5491",
    customer_id: "CUS-1002",
    created_date: daysAgoStamp(8).slice(0, 10),
    status: "reopened",
    category: "Technical",
    satisfaction_score: "2",
    history: [
      { status: "open", at: daysAgoStamp(8) },
      { status: "resolved", at: daysAgoStamp(5) },
      { status: "reopened", at: daysAgoStamp(3) },
    ],
  },
  {
    ticket_id: "TKT-5502",
    customer_id: "CUS-1003",
    created_date: daysAgoStamp(4).slice(0, 10),
    status: "open",
    category: "Onboarding",
    satisfaction_score: "",
    history: [{ status: "open", at: daysAgoStamp(4) }],
  },
];

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const ticketsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return tickets;
  },
};

// Merge uploaded ticket rows into the store, deduping by ticket_id and logging
// status changes with the current upload timestamp.
export function mergeTickets(rows: Record<string, string>[]): MergeSummary {
  const stamp = nowStamp();
  const byId = new Map(tickets.map((t) => [t.ticket_id, { ...t, history: [...t.history] }]));

  let inserted = 0;
  let updated = 0;
  let closed = 0;
  let reopened = 0;
  const newResolutionHours: number[] = [];

  for (const row of rows) {
    const ticketId = (row.ticket_id ?? "").trim();
    if (!ticketId) continue;
    const status = (row.status ?? "").trim();
    const existing = byId.get(ticketId);

    if (!existing) {
      const createdDate = (row.created_date ?? "").trim() || stamp.slice(0, 10);
      const record: TicketRecord = {
        ticket_id: ticketId,
        customer_id: (row.customer_id ?? "").trim(),
        created_date: createdDate,
        status,
        category: (row.category ?? "").trim(),
        satisfaction_score: (row.satisfaction_score ?? "").trim(),
        history: [{ status, at: createdDate }],
      };
      if (isClosing(status)) {
        record.closedAt = stamp;
        record.resolutionHours = hoursBetween(createdDate, stamp);
        closed++;
        newResolutionHours.push(record.resolutionHours);
      }
      byId.set(ticketId, record);
      inserted++;
      continue;
    }

    // Existing ticket — only overwrite when the status actually changed.
    if (status && status.toLowerCase() !== existing.status.toLowerCase()) {
      const wasClosed = isClosing(existing.status);
      existing.status = status;
      existing.history.push({ status, at: stamp });

      // Keep other fields fresh from the latest upload.
      if ((row.category ?? "").trim()) existing.category = row.category.trim();
      if ((row.satisfaction_score ?? "").trim())
        existing.satisfaction_score = row.satisfaction_score.trim();

      if (isClosing(status) && !wasClosed) {
        existing.closedAt = stamp;
        existing.resolutionHours = hoursBetween(existing.created_date, stamp);
        closed++;
        newResolutionHours.push(existing.resolutionHours);
      } else if (!isClosing(status) && wasClosed) {
        // Reopened — clear the closed state so a later re-close recomputes.
        existing.closedAt = undefined;
        existing.resolutionHours = undefined;
        reopened++;
      }
      updated++;
    }
  }

  tickets = Array.from(byId.values());
  emit();

  return {
    inserted,
    updated,
    closed,
    reopened,
    avgResolutionHours: newResolutionHours.length
      ? Math.round(
          (newResolutionHours.reduce((a, b) => a + b, 0) / newResolutionHours.length) * 10,
        ) / 10
      : null,
  };
}

export function formatDuration(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

export function useTickets() {
  return useSyncExternalStore(ticketsStore.subscribe, ticketsStore.getSnapshot, ticketsStore.getSnapshot);
}
