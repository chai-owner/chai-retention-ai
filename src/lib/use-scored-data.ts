// Reactive customer dataset. Prefers the user's REAL uploaded/synced data when
// there is enough of it to score; otherwise falls back to the illustrative
// sample dataset (used for SSR and the public, no-login demo experience).
import { useMemo } from "react";
import { useProfile } from "@/lib/profile-store";
import {
  buildDataset,
  DEFAULT_METRIC_WEIGHTS,
  
  type MetricWeights,
  type ScoredDataset,
} from "@/lib/mock-data";
import { useIngested } from "@/lib/ingested-data-store";
import { assessSufficiency, buildRealDataset, type Sufficiency } from "@/lib/real-scoring";
import { useSignedIn } from "@/lib/use-auth-state";
import { useDemoMode } from "@/lib/use-demo-mode";

// Resolve the active importance weights. When the user has saved their own set
// (from onboarding — which may be an AI-generated metric set with custom names),
// use it verbatim so scoring keys off exactly those metrics. Otherwise fall
// back to the built-in defaults.
export function resolveWeights(saved?: Record<string, number> | null): MetricWeights {
  if (saved && Object.keys(saved).length > 0) return saved;
  return DEFAULT_METRIC_WEIGHTS;
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
  const demo = useDemoMode();
  return useMemo(() => {
    // Demo mode always shows the illustrative sample dataset, even for a
    // signed-in user viewing the public product demo.
    if (demo) return buildDataset(weights);
    // Signed-in users otherwise always see their own real data — never sample
    // data, even when they've added little or nothing.
    if (signedIn) return buildRealDataset(ingested, weights, profile);
    return buildDataset(weights);
  }, [weights, ingested, profile, signedIn, demo]);
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
