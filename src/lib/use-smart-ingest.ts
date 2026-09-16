// Plan-based access for the ChAi Data Drop (smart ingest) feature.
// Standard and Enterprise include it; Core needs the paid add-on flag on the org.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { usePlanUsage, PLAN_USAGE_QUERY_KEY } from "@/lib/use-plan-usage";
import { useAuthUserId } from "@/lib/use-auth-state";
import { supabase } from "@/integrations/supabase/client";

export interface DataDropAccess {
  /** True when the Data Drop UI should be unlocked. */
  hasAccess: boolean;
  /** True only for Core orgs that bought the add-on. */
  isAddon: boolean;
  /** Included with the plan (Standard / Enterprise) — no add-on badge needed. */
  includedInPlan: boolean;
  loading: boolean;
}

export function useDataDropAccess(): DataDropAccess {
  const { data, isLoading } = usePlanUsage();
  const plan = data?.plan ?? "core";
  const includedInPlan = plan === "standard" || plan === "enterprise";
  const isAddon = !includedInPlan && Boolean(data?.smartIngestAddon);
  return {
    hasAccess: includedInPlan || isAddon,
    isAddon,
    includedInPlan,
    loading: isLoading,
  };
}

export function useEnableDataDropAddon() {
  const { openAddonCheckout } = usePaddleCheckout();
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Please sign in again to continue.");
      const { data } = await supabase.auth.getSession();
      await openAddonCheckout({ userId, customerEmail: data.session?.user.email ?? undefined });
    },
    onSuccess: () => {
      toast.success("Complete checkout to activate ChAi Data Drop.");
      void queryClient.invalidateQueries({ queryKey: PLAN_USAGE_QUERY_KEY });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't open checkout just now."),
  });
}
