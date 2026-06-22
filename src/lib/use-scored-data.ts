// Reactive customer dataset driven by the importance weights the user sets
// during onboarding. Falls back to sensible defaults when no weights are saved
// (including during SSR, where the profile is null).
import { useMemo } from "react";
import { useProfile } from "@/lib/profile-store";
import {
  buildDataset,
  DEFAULT_METRIC_WEIGHTS,
  METRIC_NAMES,
  type MetricWeights,
  type ScoredDataset,
} from "@/lib/mock-data";

// Merge saved weights over the defaults so a partial set still scores fully.
export function resolveWeights(saved?: Record<string, number> | null): MetricWeights {
  if (!saved) return DEFAULT_METRIC_WEIGHTS;
  const merged: MetricWeights = { ...DEFAULT_METRIC_WEIGHTS };
  for (const m of METRIC_NAMES) {
    if (typeof saved[m] === "number") merged[m] = saved[m];
  }
  return merged;
}

export function useMetricWeights(): MetricWeights {
  const profile = useProfile();
  return useMemo(() => resolveWeights(profile?.metricWeights), [profile?.metricWeights]);
}

export function useScoredData(): ScoredDataset {
  const weights = useMetricWeights();
  return useMemo(() => buildDataset(weights), [weights]);
}
