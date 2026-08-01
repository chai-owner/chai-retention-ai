// Client-side reactive store for customer id aliases (see customer-matching.ts).
// Hydrated from the DB on sign-in; writes go through the server functions.
import { useSyncExternalStore } from "react";
import type { CustomerAlias, AliasStatus } from "@/lib/customer-matching";
import {
  listCustomerAliases,
  saveCustomerAlias,
  deleteCustomerAlias,
} from "@/lib/customer-aliases.functions";

let aliases: CustomerAlias[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const aliasStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return aliases;
  },
  set(next: CustomerAlias[]) {
    aliases = next;
    emit();
  },
  upsert(a: CustomerAlias) {
    aliases = [...aliases.filter((x) => x.source_id !== a.source_id), a];
    emit();
  },
  remove(sourceId: string) {
    aliases = aliases.filter((x) => x.source_id !== sourceId);
    emit();
  },
  clear() {
    aliases = [];
    emit();
  },
};

export function useCustomerAliases(): CustomerAlias[] {
  return useSyncExternalStore(aliasStore.subscribe, aliasStore.getSnapshot, aliasStore.getSnapshot);
}

export async function hydrateCustomerAliases() {
  try {
    const rows = await listCustomerAliases();
    aliasStore.set(
      rows.map((r) => ({
        source_id: r.source_id,
        customer_id: r.customer_id,
        status: (r.status === "ignored" ? "ignored" : "linked") as AliasStatus,
      })),
    );
  } catch {
    // Non-fatal: matching just falls back to showing everything unmatched.
  }
}

export async function linkCustomer(sourceId: string, customerId: string) {
  aliasStore.upsert({ source_id: sourceId, customer_id: customerId, status: "linked" });
  await saveCustomerAlias({ data: { source_id: sourceId, customer_id: customerId, status: "linked" } });
}

export async function ignoreSourceId(sourceId: string) {
  aliasStore.upsert({ source_id: sourceId, customer_id: null, status: "ignored" });
  await saveCustomerAlias({ data: { source_id: sourceId, customer_id: null, status: "ignored" } });
}

export async function unlinkSourceId(sourceId: string) {
  aliasStore.remove(sourceId);
  await deleteCustomerAlias({ data: { source_id: sourceId } });
}
