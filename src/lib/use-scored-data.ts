// Reactive customer dataset. Prefers the user's REAL uploaded/synced data when
// there is enough of it to score; otherwise falls back to the illustrative
// sample dataset (used for SSR and the public, no-login demo experience).
import { useMemo } from "react";
import { useProfile, type OnboardingProfile } from "@/lib/profile-store";
import {
  buildDataset,
  DEFAULT_METRIC_WEIGHTS,
  plannerMetrics,
  type PlannerMetric,
  type MetricWeights,
  type ScoredDataset,
} from "@/lib/mock-data";
import { useIngested } from "@/lib/ingested-data-store";
import { assessSufficiency, buildRealDataset, type Sufficiency } from "@/lib/real-scoring";
import { useSignedIn } from "@/lib/use-auth-state";
import { useDemoMode } from "@/lib/use-demo-mode";

// Resolve the active importance weights. Merges the user's saved importance
// values (which may be an AI-generated metric set with custom names) with the
// AI-metric definitions from onboarding so every metric — built-in or
// AI-suggested — carries a weight into the scorer. Metrics the user hasn't
// scored yet default to 3 (Moderate). Setting a weight to 0 removes that
// metric from the blend entirely.
export function resolveWeights(
  saved?: Record<string, number> | null,
  metrics?: PlannerMetric[] | null,
): MetricWeights {
  const base: MetricWeights =
    saved && Object.keys(saved).length > 0 ? { ...saved } : { ...DEFAULT_METRIC_WEIGHTS };
  if (metrics && metrics.length > 0) {
    for (const m of metrics) {
      if (base[m.name] == null) base[m.name] = m.weight ?? 3;
    }
  }
  return base;
}

export function useMetricWeights(): MetricWeights {
  const profile = useProfile();
  return useMemo(
    () => resolveWeights(profile?.metricWeights, profile?.metrics),
    [profile?.metricWeights, profile?.metrics],
  );
}

// The active metric definitions: the AI-generated set saved during onboarding
// when present, otherwise the built-in default planner metrics.
export function useActiveMetrics(): PlannerMetric[] {
  const profile = useProfile();
  return useMemo(
    () => (profile?.metrics && profile.metrics.length > 0 ? profile.metrics : plannerMetrics),
    [profile?.metrics],
  );
}


export function useScoredData(): ScoredDataset {
  const weights = useMetricWeights();
  const ingested = useIngested();
  const profile = useProfile();
  const signedIn = useSignedIn();
  const demo = useDemoMode();
  return useMemo(() => {
    // Signed-in users ALWAYS see their own real data — never sample data,
    // even if a `?demo=1` flag leaked into the URL.
    if (signedIn) return buildRealDataset(ingested, weights, profile);
    // Demo mode (public, no-login) shows the illustrative sample dataset.
    if (demo) return buildDataset(weights);
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
