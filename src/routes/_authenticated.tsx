import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    // Force users who haven't finished onboarding into the onboarding flow.
    if (location.pathname !== "/onboarding") {
      try {
        const profile = await getProfile();
        if (!profile?.onboarded) {
          throw redirect({ to: "/onboarding" });
        }
      } catch (err) {
        if (isRedirect(err)) throw err;
        // If the profile can't be loaded, don't block the app.
      }
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
