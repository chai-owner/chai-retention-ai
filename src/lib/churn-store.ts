// Lightweight in-memory + localStorage store for manual lifecycle overrides.
// The demo customer data is static, so when a user manually marks a customer as
// churned (or won back), we record the override here and every screen reflects
// it. Mirrors the useSyncExternalStore pattern used in addons-store / uploads-store.
import { useSyncExternalStore } from "react";
import type { CustomerStatus } from "@/lib/mock-data";

export interface ChurnOverride {
  status: Extract<CustomerStatus, "churned" | "won-back">;
  reason?: string;
  /** Optional free-text detail captured alongside the reason. */
  note?: string;
  date: string;
}

/** Industry-neutral churn reasons offered when marking a customer as churned. */
export const CHURN_REASONS = [
  "Price / value",
  "Stopped using the product",
  "Poor support experience",
  "Missing features",
  "Switched to a competitor",
  "Budget cut / business closed",
  "Onboarding never landed",
  "Other",
] as const;

export type ChurnReason = (typeof CHURN_REASONS)[number];

type OverrideMap = Record<string, ChurnOverride>;

const STORAGE_KEY = "chai.churn-overrides";

function load(): OverrideMap {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as OverrideMap;
  } catch {
    return {};
  }
}

let state: OverrideMap = load();

const listeners = new Set<() => void>();
function emit() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

export const churnStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return state;
  },
  markChurned(id: string, reason?: string) {
    state = { ...state, [id]: { status: "churned", reason, date: new Date().toISOString().slice(0, 10) } };
    emit();
  },
  markWonBack(id: string) {
    state = { ...state, [id]: { status: "won-back", date: new Date().toISOString().slice(0, 10) } };
    emit();
  },
  clear(id: string) {
    if (!state[id]) return;
    const next = { ...state };
    delete next[id];
    state = next;
    emit();
  },
};

const EMPTY: OverrideMap = {};

export function useChurnOverrides(): OverrideMap {
  return useSyncExternalStore(
    churnStore.subscribe,
    churnStore.getSnapshot,
    () => EMPTY,
  );
}
