// Volatile client-side impersonation state. The admin session deliberately
// lives only in this module's memory and is lost on refresh/tab close.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { IMPERSONATION_DURATION_MS } from "@/lib/impersonation-policy";

const LEGACY_KEY = "chai.impersonation";
export { IMPERSONATION_DURATION_MS };

export interface ImpersonationState {
  adminSession: Session;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  auditId: string;
  expiresAt: string;
}

let state: ImpersonationState | null = null;
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
    emit();
  },
  clear() {
    state = null;
    emit();
  },
};

/** Remove credentials written by the legacy persistent implementation. */
export function clearLegacyImpersonationStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

/** Remove the temporary target session written by the shared auth client. */
export function clearPersistedImpersonatedAuth(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (/^sb-.*-auth-token$/.test(key)) window.localStorage.removeItem(key);
    }
  } catch {
    // The live auth client retains the session in memory for this tab.
  }
}

clearLegacyImpersonationStorage();

export function millisecondsUntilExpiry(expiresAt: string, now = Date.now()): number {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, expiry - now);
}

export function useImpersonation(): ImpersonationState | null {
  return useSyncExternalStore(
    impersonationStore.subscribe,
    impersonationStore.getSnapshot,
    impersonationStore.getServerSnapshot,
  );
}
