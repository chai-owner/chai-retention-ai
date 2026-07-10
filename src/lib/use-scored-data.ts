// Reactive customer dataset. Prefers the user's REAL uploaded/synced data when
// there is enough of it to score; otherwise falls back to the illustrative
// sample dataset (used for SSR and the public, no-login demo experience).
import { useMemo } from "react";
import { useProfile } from "@/lib/profile-store";
import {
  buildDataset,
  DEFAULT_METRIC_WEIGHTS,
  METRIC_NAMES,
  type MetricWeights,
  type ScoredDataset,
} from "@/lib/mock-data";
import { useIngested } from "@/lib/ingested-data-store";
import { assessSufficiency, buildRealDataset, type Sufficiency } from "@/lib/real-scoring";
import { useSignedIn } from "@/lib/use-auth-state";
import { useDemoMode } from "@/lib/use-demo-mode";

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
  const ingested = useIngested();
  const profile = useProfile();
  const signedIn = useSignedIn();
  return useMemo(() => {
    // Signed-in users always see their own real data — never sample data, even
    // when they've added little or nothing. Sample data is reserved for the
    // public, no-login demo.
    if (signedIn) return buildRealDataset(ingested, weights, profile);
    return buildDataset(weights);
  }, [weights, ingested, profile, signedIn]);
}

// Real-only assessment (never falls back to sample data). Used by the first-run
// insights screen so a user who added little/no data sees an honest "not enough
// data" message instead of a fabricated snapshot.
export function useRealAssessment(): { sufficiency: Sufficiency; dataset: ScoredDataset | null } {
  const weights = useMetricWeights();
  const ingested = useIngested();
  const profile = useProfile();
  return useMemo(() => {
    const sufficiency = assessSufficiency(ingested);
    const dataset =
      sufficiency.customerCount > 0 ? buildRealDataset(ingested, weights, profile) : null;
    return { sufficiency, dataset };
  }, [weights, ingested, profile]);
}
