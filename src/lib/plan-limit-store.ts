// Tiny store used to surface a "you've hit your plan's customer limit" notice
// from anywhere (imports, syncs) to the modal rendered by the app shell.
import { useSyncExternalStore } from "react";

let notice: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function raisePlanLimitNotice(message: string) {
  notice = message;
  emit();
}

export function clearPlanLimitNotice() {
  notice = null;
  emit();
}

export function isPlanLimitMessage(message: string): boolean {
  return /upgrade your plan to continue/i.test(message);
}

export function usePlanLimitNotice(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => notice,
    () => null,
  );
}
