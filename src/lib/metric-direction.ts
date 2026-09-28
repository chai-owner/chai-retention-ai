import type { PlannerMetric } from "@/lib/mock-data";

// Single source of truth for whether "more" or "fewer" is better on a
// measure. Shared by the nightly score (customer-scoring.ts) and the customer
// page (real-scoring.ts) so the two can never disagree on direction.

function metricText(metric: PlannerMetric): string {
  return [metric.name, metric.why, metric.churn, metric.reason, metric.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** True when the metric measures elapsed time since an event ("days since last…"). */
export function isElapsedMetric(metric: PlannerMetric): boolean {
  return /(days?|weeks?|months?)\s+since|time since|last (purchase|payment|order|visit|login|contact|session|interaction)|inactiv|dormant|ghost|lapse/.test(
    metricText(metric),
  );
}

/**
 * Direction of "good" for a metric. Explicit display anchors win; otherwise it
 * is inferred from the category and wording — elapsed-time, cost, complaint and
 * transaction-recency language means lower is better, while engagement and
 * retention language means higher is better.
 */
export function metricDirection(metric: PlannerMetric): "higher" | "lower" {
  if (metric.valueAt0 != null && metric.valueAt100 != null) {
    return metric.valueAt0 > metric.valueAt100 ? "lower" : "higher";
  }
  const text = metricText(metric);
  const category = (metric.category ?? "").toLowerCase();
  if (isElapsedMetric(metric)) return "lower";
  if (/overdue|late|delay|complaint|escalation|churn|cancel|refund|failure|backlog|wait|ticket volume|downtime|defect/.test(text)) {
    return "lower";
  }
  if (category === "engagement" || category === "retention" || category === "satisfaction") return "higher";
  if (category === "support") return "lower";
  // Transactions is recency/obligation heavy in practice; only treat it as
  // lower-is-better when there is no clear "more is better" value language.
  if (category === "transactions") {
    return /revenue|value|spend|amount|frequency|depth|penetration|volume of purchases|renewal/.test(text)
      ? "higher"
      : "lower";
  }
  return "higher";
}

/** Convenience: true when fewer/lower is better for this measure. */
export function lowerIsBetter(metric: PlannerMetric): boolean {
  return metricDirection(metric) === "lower";
}
