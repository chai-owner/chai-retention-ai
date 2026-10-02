// User-added metrics: the shape ChAi saves when an owner adds their own metric
// in onboarding, the AI enrichment that fills in its description, and the
// required "more or fewer is better" choice. Pure — shared by the browser and
// the enrichment server function, and unit-tested.
import type { MetricDirection, PlannerMetric } from "@/lib/mock-data";

export const METRIC_CATEGORIES = ["Engagement", "Transactions", "Support", "Satisfaction", "Retention"] as const;

/** The reason saved when no AI description could be generated. */
export const USER_METRIC_FALLBACK_REASON = "You asked ChAi to track this metric.";

export interface MetricEnrichment {
  category: string;
  why: string;
  churn: string;
  reason: string;
  /** ChAi's suggestion only — the user's own choice always wins. */
  direction: MetricDirection | null;
}

export function normalizeDirection(value: unknown): MetricDirection | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "higher" || v === "more" || v === "up") return "higher";
  if (v === "lower" || v === "fewer" || v === "less" || v === "down") return "lower";
  return null;
}

export function normalizeCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return METRIC_CATEGORIES.find((c) => c.toLowerCase() === v) ?? null;
}

/** Reads the enrichment JSON object from an AI reply; null when unusable. */
export function parseMetricEnrichment(raw: string): MetricEnrichment | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const category = normalizeCategory(parsed.category);
  const why = typeof parsed.why === "string" ? parsed.why.trim() : "";
  const churn = typeof parsed.churn === "string" ? parsed.churn.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  if (!category || !why) return null;
  return { category, why, churn, reason, direction: normalizeDirection(parsed.direction) };
}

/**
 * Builds the metric to save. Returns null until the user has chosen a
 * direction — the choice is required. The metric keeps the user's own name;
 * without an enrichment it falls back to today's plain filler.
 */
export function buildUserMetric(
  name: string,
  direction: MetricDirection | null,
  enrichment: MetricEnrichment | null,
): PlannerMetric | null {
  const trimmed = name.trim();
  if (!trimmed || !direction) return null;
  return {
    name: trimmed,
    category: enrichment?.category ?? "Engagement",
    why: enrichment?.why ?? "",
    churn: enrichment?.churn ?? "",
    weight: 3,
    reason: enrichment?.reason || USER_METRIC_FALLBACK_REASON,
    direction,
    userAdded: true,
  };
}

export const DIRECTION_LABELS: Record<MetricDirection, string> = {
  higher: "More is better",
  lower: "Fewer is better",
};
