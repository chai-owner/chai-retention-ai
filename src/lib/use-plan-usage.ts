import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlanUsage, type PlanUsage } from "@/lib/organisations.functions";
import { TEAM_QUERY_KEY } from "@/lib/use-team";

export const PLAN_USAGE_QUERY_KEY = ["organisation", "plan-usage"] as const;

export function usePlanUsage(enabled = true) {
  const fetchUsage = useServerFn(getPlanUsage);
  return useQuery<PlanUsage>({
    queryKey: PLAN_USAGE_QUERY_KEY,
    queryFn: () => fetchUsage(),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/** Refresh everything that depends on the plan after an upgrade. */
export function useRefreshPlan() {
  const queryClient = useQueryClient();
  return () => {
    // Covers plan usage, team and the trial/access snapshot the paywall reads.
    void queryClient.invalidateQueries({ queryKey: ["organisation"] });
    void queryClient.invalidateQueries({ queryKey: PLAN_USAGE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
  };
}
