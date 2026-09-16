// Loads the signed-in user's profile from Lovable Cloud into the local
// profile store on app load, so personalization works across devices.
// localStorage continues to act as an instant cache.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/profile.functions";
import { profileStore } from "@/lib/profile-store";
import type { PlannerMetric } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { ensureLocalCacheOwner } from "@/lib/local-user-scope";

export function useProfileSync() {
  const fetchProfile = useServerFn(getProfile);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || !data.session) return;
        // Never let a cached profile from another account survive into this
        // session — clear it before the remote profile arrives.
        ensureLocalCacheOwner(data.session.user?.id ?? null);
        return fetchProfile();
      })
      .then((remote) => {
        if (cancelled || !remote) return;
        if (!remote.onboarded) {
          // Account was reset (or never finished onboarding): drop every local
          // cache so no stale data survives in this browser.
          profileStore.clear();
          if (typeof window !== "undefined") {
            try {
              for (const key of Object.keys(window.localStorage)) {
                if (key.startsWith("chai.") && key !== "chai.promo-code" && key !== "chai.cache.owner")
                  window.localStorage.removeItem(key);
              }
            } catch {
              // ignore storage failures
            }
          }
          return;
        }

        profileStore.save({
          fullName: remote.fullName,
          email: remote.email,
          unlocked: remote.unlocked,
          bookedAt: remote.bookedAt,
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
          mustTrack: remote.mustTrack,
          segments: remote.segments,
          successActions: remote.successActions,
          disengagement: remote.disengagement,
          tracked: remote.tracked,
          channels: remote.channels,
          metricWeights: remote.metricWeights,
          churnDefinition: remote.churnDefinition,
          // Keep the locally cached metric set if the account predates metric
          // persistence, so upload templates never fall back to the generic set.
          metrics:
            remote.metrics && remote.metrics.length > 0
              ? (remote.metrics as unknown as PlannerMetric[])
              : profileStore.getSnapshot()?.metrics,
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
