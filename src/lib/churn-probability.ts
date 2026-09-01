// Churn probability is derived directly from the health score — there is no
// separate model. Each health band maps onto a probability band, with a linear
// interpolation inside the band so a customer at 39 never reads the same as a
// customer at 0.
//
//   health 70–100 (healthy)  -> 15% down to 2%
//   health 40–69  (at-risk)  -> 45% down to 16%
//   health 0–39   (critical) -> 85% down to 46%
//
// It is always presented as a probability over a stated horizon, never as a
// statement of fact.

export const CHURN_HORIZON_DAYS = 90;

export type ChurnConfidence = "high" | "moderate" | "low";

interface Band {
  /** Inclusive health range. */
  healthLow: number;
  healthHigh: number;
  /** Probability at healthLow (worst health in the band). */
  probAtLow: number;
  /** Probability at healthHigh (best health in the band). */
  probAtHigh: number;
}

const BANDS: Band[] = [
  { healthLow: 70, healthHigh: 100, probAtLow: 15, probAtHigh: 2 },
  { healthLow: 40, healthHigh: 69, probAtLow: 45, probAtHigh: 16 },
  { healthLow: 0, healthHigh: 39, probAtLow: 85, probAtHigh: 46 },
];

/** Churn probability (%) for a 0–100 health score, rounded to a whole number. */
export function churnProbabilityFromHealth(health: number): number {
  const h = Math.max(0, Math.min(100, Number.isFinite(health) ? health : 0));
  const band = BANDS.find((b) => h >= b.healthLow && h <= b.healthHigh) ?? BANDS[2]!;
  const span = band.healthHigh - band.healthLow;
  const ratio = span === 0 ? 0 : (h - band.healthLow) / span;
  const prob = band.probAtLow + (band.probAtHigh - band.probAtLow) * ratio;
  return Math.round(prob);
}

/** Confidence in the probability, based on how many metric categories have data. */
export function churnConfidenceFor(categoryCount: number): ChurnConfidence {
  if (categoryCount >= 3) return "high";
  if (categoryCount === 2) return "moderate";
  return "low";
}

const CONFIDENCE_LABELS: Record<ChurnConfidence, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence — upload more data to improve accuracy",
};

export function churnConfidenceLabel(confidence: ChurnConfidence): string {
  return CONFIDENCE_LABELS[confidence];
}

/** The only approved phrasing for a churn probability. */
export function churnProbabilityPhrase(probability: number): string {
  return `${Math.round(probability)}% probability of churning in the next ${CHURN_HORIZON_DAYS} days`;
}
