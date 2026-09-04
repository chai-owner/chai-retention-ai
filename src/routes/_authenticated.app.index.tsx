import { createFileRoute, redirect } from "@tanstack/react-router";
import { getProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: async () => {
    // Until Bekah unlocks the account in admin, the default landing page is the
    // Welcome screen (onboarding call booking + first assessment). After
    // unlocking, Today becomes the default.
    try {
      const profile = await getProfile();
      if (profile && profile.unlocked !== true) {
        throw redirect({ to: "/app/welcome" });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err;
      // Profile unavailable (demo visitor, offline): fall through to Today.
    }
    throw redirect({ to: "/app/today" });
  },
});
