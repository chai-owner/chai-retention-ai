// Plan-based access for the ChAi Data Drop (smart ingest) feature.
// Growth and Pro include it; Starter needs the paid add-on flag on the org.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { enableSmartIngestAddon } from "@/lib/organisations.functions";
import { usePlanUsage, PLAN_USAGE_QUERY_KEY } from "@/lib/use-plan-usage";

export interface DataDropAccess {
  /** True when the Data Drop UI should be unlocked. */
  hasAccess: boolean;
  /** True only for Starter orgs that bought the add-on. */
  isAddon: boolean;
  /** Included with the plan (Growth / Pro) — no add-on badge needed. */
  includedInPlan: boolean;
  loading: boolean;
}

export function useDataDropAccess(): DataDropAccess {
  const { data, isLoading } = usePlanUsage();
  const plan = data?.plan ?? "starter";
  const includedInPlan = plan === "growth" || plan === "pro";
  const isAddon = !includedInPlan && Boolean(data?.smartIngestAddon);
  return {
    hasAccess: includedInPlan || isAddon,
    isAddon,
    includedInPlan,
    loading: isLoading,
  };
}

export function useEnableDataDropAddon() {
  const enable = useServerFn(enableSmartIngestAddon);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => enable(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLAN_USAGE_QUERY_KEY });
    },
  });
}
