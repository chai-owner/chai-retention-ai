// Single source of truth for "which datasets can a user bring in?".
// Combines the fixed dataset templates with one synthetic dataset per metric
// ChAi nominated during onboarding, so manual uploads, the AI Data Drop and the
// integration sync wizards all recognise the same set.
import { useMemo } from "react";
import { datasetSchemas, type DatasetSchema } from "@/lib/data-schemas";
import { useProfile, type OnboardingProfile } from "@/lib/profile-store";
import {
  buildCustomMetricDatasets,
  personalizeDatasets,
  type PersonalizedDataset,
} from "@/lib/personalize-data";

export function allDatasetSchemas(profile: OnboardingProfile | null): DatasetSchema[] {
  return [...datasetSchemas, ...buildCustomMetricDatasets(profile?.metrics)];
}

export function useAllSchemas(): DatasetSchema[] {
  const profile = useProfile();
  return useMemo(() => allDatasetSchemas(profile), [profile]);
}

// `metricsOverride` lets callers (e.g. onboarding, before the profile is saved)
// use the metric set currently in flight instead of the persisted profile.
export function useAllDatasets(metricsOverride?: PlannerMetric[]): PersonalizedDataset[] {
  const stored = useProfile();
  return useMemo(() => {
    const profile: OnboardingProfile | null = metricsOverride
      ? ({ ...(stored ?? {}), metrics: metricsOverride } as OnboardingProfile)
      : stored;
    return personalizeDatasets(profile, allDatasetSchemas(profile));
  }, [stored, metricsOverride]);
}

