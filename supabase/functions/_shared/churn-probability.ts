// Ported verbatim from src/lib/churn-probability.ts.
export const CHURN_HORIZON_DAYS = 90;
export type ChurnConfidence = "high" | "moderate" | "low";

interface Band {
  healthLow: number;
  healthHigh: number;
  probAtLow: number;
  probAtHigh: number;
}

const BANDS: Band[] = [
  { healthLow: 70, healthHigh: 100, probAtLow: 15, probAtHigh: 2 },
  { healthLow: 40, healthHigh: 69, probAtLow: 45, probAtHigh: 16 },
  { healthLow: 0, healthHigh: 39, probAtLow: 85, probAtHigh: 46 },
];

export function churnProbabilityFromHealth(health: number): number {
  const h = Math.max(0, Math.min(100, Number.isFinite(health) ? health : 0));
  const band = BANDS.find((b) => h >= b.healthLow && h <= b.healthHigh) ?? BANDS[2]!;
  const span = band.healthHigh - band.healthLow;
  const ratio = span === 0 ? 0 : (h - band.healthLow) / span;
  const prob = band.probAtLow + (band.probAtHigh - band.probAtLow) * ratio;
  return Math.round(prob);
}

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
