// Lightweight in-memory store for paid add-on enablement. UI gating only —
// flipping these flags does not wire up real billing. Uses useSyncExternalStore
// so every screen stays in sync, matching the pattern in uploads-store.ts.
import { useSyncExternalStore } from "react";

export interface AddonsState {
  smartIngest: boolean;
}

let state: AddonsState = {
  smartIngest: false,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const addonsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return state;
  },
  enable(key: keyof AddonsState) {
    if (state[key]) return;
    state = { ...state, [key]: true };
    emit();
  },
  disable(key: keyof AddonsState) {
    if (!state[key]) return;
    state = { ...state, [key]: false };
    emit();
  },
};

export function useAddons() {
  return useSyncExternalStore(addonsStore.subscribe, addonsStore.getSnapshot, addonsStore.getSnapshot);
}

// Pricing presented in the add-on upgrade UI.
export const SMART_INGEST_PRICING = {
  monthly: 39,
  includedPages: 250,
  topUpPerPage: 0.2,
};
