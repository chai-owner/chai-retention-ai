// In-memory store of the ACTUAL rows a user uploads or syncs, keyed by dataset
// (customers / transactions / usage / support / surveys). This is what powers
// true per-customer scoring — as opposed to uploads-store.ts, which only tracks
// upload metadata for the Data Quality view. Starts empty: nothing here is demo
// data, it is purely what the user brings in.
import { useSyncExternalStore } from "react";

export type IngestRow = Record<string, string>;
export type IngestedData = Record<string, IngestRow[]>;

// Every row remembers which platform it came from. The same raw customer id
// can mean different companies in Zendesk vs Xero, so identity is always the
// pair (source, customer_id) — see customer-matching.ts.
export const SOURCE_FIELD = "__source";
export const UNKNOWN_SOURCE = "unknown";

/** Stamp rows with the platform they were ingested from. */
export function tagSource(rows: IngestRow[], source: string): IngestRow[] {
  const s = (source || "").trim() || UNKNOWN_SOURCE;
  return rows.map((r) => (r[SOURCE_FIELD] ? r : { ...r, [SOURCE_FIELD]: s }));
}

// The natural primary key per dataset, used to de-duplicate on re-upload.
// Datasets without a single row-key (usage, surveys) simply append.
const ID_FIELD: Record<string, string> = {
  customers: "customer_id",
  transactions: "transaction_id",
  support: "ticket_id",
};

let data: IngestedData = {};
// True once the user's persisted rows have been loaded from the server. Until
// then the store is legitimately empty and must not be reported as "no data".
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}


// Turn schema-field-ordered string rows into keyed objects.
export function rowsToObjects(fieldNames: string[], rows: string[][]): IngestRow[] {
  return rows.map((r) => {
    const o: IngestRow = {};
    fieldNames.forEach((name, i) => {
      o[name] = (r[i] ?? "").trim();
    });
    return o;
  });
}

export const ingestedStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return data;
  },
  addRows(key: string, rows: IngestRow[]) {
    if (!rows.length) return;
    const existing = data[key] ?? [];
    const idField = ID_FIELD[key];
    let merged: IngestRow[];
    if (idField) {
      const byId = new Map<string, IngestRow>();
      let n = 0;
      for (const row of existing) byId.set(row[idField] || `__${key}_${n++}`, row);
      for (const row of rows) byId.set(row[idField] || `__${key}_${n++}`, row);
      merged = [...byId.values()];
    } else {
      merged = [...existing, ...rows];
    }
    data = { ...data, [key]: merged };
    emit();
  },
  clear() {
    data = {};
    emit();
  },
  markHydrated() {
    if (hydrated) return;
    hydrated = true;
    emit();
  },
  isHydrated() {
    return hydrated;
  },
};

export function useIngested(): IngestedData {
  return useSyncExternalStore(
    ingestedStore.subscribe,
    ingestedStore.getSnapshot,
    ingestedStore.getSnapshot,
  );
}

/** True once persisted rows have been loaded (or definitively failed to load). */
export function useIngestHydrated(): boolean {
  return useSyncExternalStore(
    ingestedStore.subscribe,
    ingestedStore.isHydrated,
    () => false,
  );
}

