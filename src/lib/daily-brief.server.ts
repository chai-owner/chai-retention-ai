// Loads a daily brief for one account straight out of the stored scoring
// snapshots. Shared by the Today screen's server function (user-scoped client,
// RLS applies) and the Monday digest cron (admin client, iterating accounts).
import {
  buildDailyBrief,
  type DailyBrief,
  type SnapshotRow,
} from "@/lib/daily-brief";

// Structurally typed so either a user-scoped or an admin Supabase client fits.
type AnyClient = {
  from: (table: string) => any;
};

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

  const scoredAt = latest
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

/** Optional AI headline; falls back silently to the deterministic sentence. */
export async function aiHeadlineFor(brief: DailyBrief): Promise<string> {
  try {
    const { getAiProvider } = await import("@/lib/ai-provider.server");
    const facts = [
      `total scored customers: ${brief.totalScored}`,
      `at risk: ${brief.atRiskCount}`,
      `critical: ${brief.criticalCount}`,
      `dropped into critical since the last snapshot: ${brief.droppedIntoCritical}`,
      `declined significantly: ${brief.declinedCount}`,
      `improved significantly: ${brief.improvedCount}`,
      brief.actions.length
        ? `top concerns: ${brief.actions
            .map((a) => `${a.name} (${a.score}/100${a.topMetric ? `, ${a.topMetric}` : ""})`)
            .join("; ")}`
        : "no customers currently need attention",
    ].join("\n");

    const result = await getAiProvider().generateSummary({
      operation: "dailyBriefHeadline",
      instructions:
        "You write the one-line headline of a business owner's daily customer brief. " +
        "Return ONE warm, plain-English sentence of at most 16 words summarising the state of the customer base. " +
        "Use only the numbers given, never invent any. No markdown, no quotes.",
      content: facts,
    });
    if (!result.ok) return brief.headline;
    const text = result.text.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.trim();
    return text && text.length > 0 && text.length <= 200 ? text : brief.headline;
  } catch {
    return brief.headline;
  }
}

export async function loadDailyBrief(
  supabase: AnyClient,
  userId: string,
  options: { useAi?: boolean } = {},
): Promise<DailyBrief & { scoredAt: string | null }> {
  const { latest, previous, scoredAt } = await loadSnapshots(supabase, userId);
  const base = buildDailyBrief({ latest, previous });
  const names = await loadCustomerNames(
    supabase,
    userId,
    base.actions.map((a) => a.customerId),
  );
  const brief = buildDailyBrief({ latest, previous, names });
  const headline = options.useAi ? await aiHeadlineFor(brief) : brief.headline;
  return { ...brief, headline, scoredAt };
}
