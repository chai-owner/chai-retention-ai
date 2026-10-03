// Ported from src/lib/daily-brief.server.ts, admin-client (cron) path only —
// the RLS-scoped Today-screen variant isn't needed here.
//
// NOTE on the AI headline: the source's `aiHeadlineFor()` calls
// `getAiProvider().generateSummary()`, which in the source app first tries
// Lovable's AI gateway (LOVABLE_API_KEY) and falls back to a direct
// Anthropic call (ANTHROPIC_API_KEY). That whole provider/rate-limiting
// stack was NOT ported here (see migration notes) — this loader always uses
// the deterministic headline that `buildDailyBrief` already produces. If you
// want the AI headline back later, that's a separate, self-contained addition.
import { buildDailyBrief, type DailyBrief, type SnapshotRow } from "./daily-brief.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = { from: (table: string) => any };

const NAME_KEYS = [
  "customer_name",
  "name",
  "company",
  "company_name",
  "account_name",
  "full_name",
  "display_name",
  "contact_name",
  "email",
];

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

export async function loadSnapshots(
  supabase: AnyClient,
  userId: string,
): Promise<{ latest: SnapshotRow[]; previous: SnapshotRow[]; scoredAt: string | null }> {
  const { data: latestRows, error } = await supabase
    .from("customer_scores")
    .select("customer_id, score, risk_level, score_breakdown, scored_at")
    .eq("user_id", userId)
    .eq("is_latest", true)
    .limit(5000);
  if (error) throw new Error(error.message);

  const latest = ((latestRows ?? []) as SnapshotRow[]).map((r) => ({
    ...r,
    score: Number(r.score),
  }));
  if (latest.length === 0) return { latest, previous: [], scoredAt: null };

  const scoredAt =
    latest
      .map((r) => r.scored_at ?? "")
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  let previous: SnapshotRow[] = [];
  if (scoredAt) {
    const { data: priorRows } = await supabase
      .from("customer_scores")
      .select("customer_id, score, risk_level, score_breakdown, scored_at")
      .eq("user_id", userId)
      .lt("scored_at", scoredAt)
      .order("scored_at", { ascending: false })
      .limit(5000);
    const rows = ((priorRows ?? []) as SnapshotRow[]).map((r) => ({
      ...r,
      score: Number(r.score),
    }));
    const priorAt = rows[0]?.scored_at ?? null;
    // Only the most recent earlier run counts as "yesterday".
    previous = priorAt ? rows.filter((r) => r.scored_at && sameDay(r.scored_at, priorAt)) : [];
  }

  return { latest, previous, scoredAt };
}

export async function loadCustomerNames(
  supabase: AnyClient,
  userId: string,
  customerIds: string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (customerIds.length === 0) return names;
  const { data } = await supabase
    .from("ingested_customers")
    .select("customer_id, data")
    .eq("user_id", userId)
    .in("customer_id", customerIds)
    .limit(1000);
  for (const row of (data ?? []) as Array<{ customer_id: string; data: unknown }>) {
    if (names[row.customer_id]) continue;
    const payload = (row.data ?? {}) as Record<string, unknown>;
    for (const key of NAME_KEYS) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        names[row.customer_id] = value.trim();
        break;
      }
    }
  }
  return names;
}

export async function loadDailyBrief(
  supabase: AnyClient,
  userId: string,
): Promise<DailyBrief & { scoredAt: string | null }> {
  const { latest, previous, scoredAt } = await loadSnapshots(supabase, userId);
  const base = buildDailyBrief({ latest, previous });
  const names = await loadCustomerNames(
    supabase,
    userId,
    base.actions.map((a) => a.customerId),
  );
  const brief = buildDailyBrief({ latest, previous, names });
  return { ...brief, scoredAt };
}
