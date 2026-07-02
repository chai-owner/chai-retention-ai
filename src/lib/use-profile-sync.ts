// Loads the signed-in user's profile from Lovable Cloud into the local
// profile store on app load, so personalization works across devices.
// localStorage continues to act as an instant cache.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/profile.functions";
import { profileStore } from "@/lib/profile-store";
import { supabase } from "@/integrations/supabase/client";

export function useProfileSync() {
  const fetchProfile = useServerFn(getProfile);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || !data.session) return;
        return fetchProfile();
      })
      .then((remote) => {
        if (cancelled || !remote || !remote.onboarded) return;
        profileStore.save({
          company: remote.company,
          industry: remote.industry,
          model: remote.model,
          size: remote.size,
          customers: remote.customers,
          avgValue: remote.avgValue,
          whatBuy: remote.whatBuy,
          cadence: remote.cadence,
          lifespan: remote.lifespan,
          concerns: remote.concerns,
          segments: remote.segments,
          successActions: remote.successActions,
          disengagement: remote.disengagement,
          tracked: remote.tracked,
          channels: remote.channels,
          metricWeights: remote.metricWeights,
        });
      })
      .catch(() => {
        // Offline / not reachable — fall back to the localStorage cache.
      });
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);
}
