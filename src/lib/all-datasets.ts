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

export function useAllDatasets(): PersonalizedDataset[] {
  const profile = useProfile();
  return useMemo(() => personalizeDatasets(profile, allDatasetSchemas(profile)), [profile]);
}
