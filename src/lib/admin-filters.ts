// Pure helpers for the admin console tables: free-text search, plan filtering
// and the rule that decides whether an account may be permanently deleted.
import type { OrgPlan } from "@/lib/organisations";

export type PlanFilter = "all" | OrgPlan | "trial";

export interface SearchableRow {
  fullName?: string;
  name?: string;
  email?: string;
  company?: string;
}

/** Case-insensitive match across name, email and company. */
export function matchesSearch(row: SearchableRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [row.fullName, row.name, row.email, row.company]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export interface PlanRow {
  plan: OrgPlan | null;
  trialEndsAt: string | null;
}

/** "trial" means an organisation whose trial window has not passed yet. */
export function matchesPlan(row: PlanRow, filter: PlanFilter, now: Date = new Date()): boolean {
  if (filter === "all") return true;
  if (filter === "trial") {
    return Boolean(row.trialEndsAt) && Date.parse(row.trialEndsAt!) > now.getTime();
  }
  return row.plan === filter;
}

/** Only dry accounts — never onboarded, no customer records — can be deleted. */
export function canDeleteAccount(row: { onboarded: boolean; customerCount: number }): boolean {
  return !row.onboarded && row.customerCount === 0;
}
