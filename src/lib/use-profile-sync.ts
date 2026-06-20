// Loads the signed-in user's profile from Lovable Cloud into the local
// profile store on app load, so personalization works across devices.
// localStorage continues to act as an instant cache.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfile } from "@/lib/profile.functions";
import { profileStore } from "@/lib/profile-store";

export function useProfileSync() {
  const fetchProfile = useServerFn(getProfile);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((remote) => {
        if (cancelled || !remote || !remote.onboarded) return;
        profileStore.save({
          company: remote.company,
          industry: remote.industry,
          model: remote.model,
          segments: remote.segments,
          successActions: remote.successActions,
          disengagement: remote.disengagement,
          tracked: remote.tracked,
          channels: remote.channels,
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
