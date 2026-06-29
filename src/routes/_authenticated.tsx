import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // The /app/* pages run on sample data, so anyone can explore them as a
    // public demo without signing in. Everything else still requires login.
    const isDemo = location.pathname.startsWith("/app");

    let user = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      user = error ? null : data.user;
    } catch {
      // If getUser() throws (network, init issue, etc.), treat as unauthenticated.
      user = null;
    }

    if (!user) {
      if (isDemo) return { user: null };
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    // Force signed-in users who haven't finished onboarding into the flow.
    if (location.pathname !== "/onboarding" && location.pathname !== "/admin") {
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

    return { user };
  },
  component: () => <Outlet />,
});
