import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTeam, type TeamSnapshot } from "@/lib/organisations.functions";
import type { OrgRole } from "@/lib/organisations";

export const TEAM_QUERY_KEY = ["organisation", "team"] as const;

export function useTeam(enabled = true) {
  const fetchTeam = useServerFn(getMyTeam);
  return useQuery<TeamSnapshot>({
    queryKey: TEAM_QUERY_KEY,
    queryFn: () => fetchTeam(),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * The signed-in user's role in their organisation. `undefined` while loading,
 * so callers can avoid flashing a "no access" screen before the role arrives.
 */
export function useOrgRole(enabled = true): OrgRole | undefined {
  const { data } = useTeam(enabled);
  return data?.myRole;
}
