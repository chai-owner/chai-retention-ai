import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccessState, type AccessState } from "@/lib/access.functions";

export const ACCESS_QUERY_KEY = ["organisation", "access"] as const;

export function useAccessState(enabled = true) {
  const fetchAccess = useServerFn(getAccessState);
  return useQuery<AccessState>({
    queryKey: ACCESS_QUERY_KEY,
    queryFn: () => fetchAccess(),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
