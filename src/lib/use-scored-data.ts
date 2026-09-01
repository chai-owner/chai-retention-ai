// Reactive customer dataset. Prefers the user's REAL uploaded/synced data when
// there is enough of it to score; otherwise falls back to the illustrative
// sample dataset (used for SSR and the public, no-login demo experience).
import { useMemo } from "react";
import { useProfile } from "@/lib/profile-store";
import {
  buildDataset,
  DEFAULT_METRIC_WEIGHTS,
  plannerMetrics,
  type PlannerMetric,
  type MetricWeights,
  type ScoredDataset,
} from "@/lib/mock-data";
import { useIngested } from "@/lib/ingested-data-store";
import { useCustomerAliases } from "@/lib/customer-aliases";
import { applyAliases, resolveIdentities } from "@/lib/customer-matching";
import { mergeRoster } from "@/lib/customer-merge";
import { assessSufficiency, buildRealDataset, type Sufficiency } from "@/lib/real-scoring";
import { assessCoverage, type DataCoverage } from "@/lib/data-coverage";
import { useEffectiveSignedIn } from "@/lib/use-auth-state";
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


// Neutral, all-zero dataset used while the auth session is still resolving, so
// no one ever sees the fabricated sample companies in place of their own data.
export function emptyDataset(): ScoredDataset {
  return {
    customers: [],
    sortedByRisk: [],
    totalRevenue: 0,
    revenueAtRisk: 0,
    executive: {
      totalCustomers: 0,
      healthy: 0,
      watch: 0,
      atRisk: 0,
      critical: 0,
      predictedMonthlyChurn: 0,
      predictedRevenueLoss: 0,
      revenueAtRisk: 0,
      retentionOpportunity: 0,
    },
    healthDistribution: [],
    segmentRevenue: [],
  };
}

export function useScoredData(): ScoredDataset {
  const weights = useMetricWeights();
  const raw = useIngested();
  const aliases = useCustomerAliases();
  const ingested = useMemo(() => mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases), [raw, aliases]);
  const profile = useProfile();
  const signedIn = useEffectiveSignedIn();
  const demo = useDemoMode();
  return useMemo(() => {
    // Session still resolving — show a neutral empty state, never sample data.
    if (signedIn === null) return emptyDataset();
    // Signed-in users ALWAYS see their own real data — never sample data,
    // even if a `?demo=1` flag leaked into the URL.
    if (signedIn === true) return buildRealDataset(ingested, weights, profile);
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
  const raw = useIngested();
  const aliases = useCustomerAliases();
  const ingested = useMemo(() => mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases), [raw, aliases]);
  const profile = useProfile();
  return useMemo(() => {
    const sufficiency = assessSufficiency(ingested, profile?.metrics);
    const dataset =
      sufficiency.customerCount > 0 ? buildRealDataset(ingested, weights, profile) : null;
    return { sufficiency, dataset };
  }, [weights, ingested, profile]);
}

// Data coverage & freshness for the signed-in user's real data. The public
// demo always reports full coverage so the sample experience stays clean.
export function useDataCoverage(): DataCoverage {
  const raw = useIngested();
  const aliases = useCustomerAliases();
  const ingested = useMemo(
    () => mergeRoster(applyAliases(resolveIdentities(raw), aliases), aliases),
    [raw, aliases],
  );
  const profile = useProfile();
  const signedIn = useEffectiveSignedIn();
  return useMemo(() => {
    const c = assessCoverage(ingested, profile?.metrics);
    if (!signedIn) return { ...c, flagged: false, confidence: "good" as const, notes: [] };
    return c;
  }, [ingested, profile?.metrics, signedIn]);
}
