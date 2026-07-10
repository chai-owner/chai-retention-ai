// Client-side impersonation state. When an admin impersonates a customer we
// stash the admin's own session so we can restore it on exit. Backed by
// localStorage + useSyncExternalStore so the banner stays in sync app-wide.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";

const KEY = "chai.impersonation";

export interface ImpersonationState {
  adminSession: Session;
  targetName: string;
  targetEmail: string;
  auditId: string | null;
}

function read(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

let state: ImpersonationState | null = read();
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const impersonationStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): ImpersonationState | null {
    return state;
  },
  getServerSnapshot(): ImpersonationState | null {
    return null;
  },
  start(next: ImpersonationState) {
    state = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    }
    emit();
  },
  clear() {
    state = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
    }
    emit();
  },
};

export function useImpersonation(): ImpersonationState | null {
  return useSyncExternalStore(
    impersonationStore.subscribe,
    impersonationStore.getSnapshot,
    impersonationStore.getServerSnapshot,
  );
}
