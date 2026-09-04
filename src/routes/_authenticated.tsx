import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProfile } from "@/lib/profile.functions";
import { isDemoValue } from "@/lib/use-demo-mode";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, search }) => {
    // The /app/* pages run on sample data, so anyone can explore them as a
    // public demo without signing in. Everything else still requires login.
    const isDemo = location.pathname.startsWith("/app");
    // Explicit demo mode (?demo=1): show the sample-data product demo even to a
    // signed-in user, and never redirect them into onboarding/welcome.
    const demoMode = isDemoValue((search as { demo?: unknown })?.demo);

    let user = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      user = error ? null : data.user;
    } catch {
      // If getUser() throws (network, init issue, etc.), treat as unauthenticated.
      user = null;
    }

    // Right after sign-up/confirmation the session can still be hydrating from
    // the URL; without this fallback the visitor is mistaken for a demo guest
    // and drops into the sample-data app instead of onboarding.
    if (!user) {
      try {
        const { data } = await supabase.auth.getSession();
        user = data.session?.user ?? null;
      } catch {
        user = null;
      }
    }

    if (!user) {
      if (isDemo) return { user: null };
      throw redirect({ to: "/auth", search: { redirect: location.href, mode: undefined, demo: false } });
    }

    if (demoMode && !user) return { user: null };



    // Force signed-in users who haven't finished onboarding into the flow.
    if (location.pathname !== "/onboarding" && location.pathname !== "/admin") {
      try {
        const profile = await getProfile();
        if (!profile?.onboarded) {
          throw redirect({ to: "/onboarding" });
        }
        // Onboarded but not yet unlocked by an admin: keep them on the
        // insights/booking screen. They may still revisit Business Profile
        // and Data to improve their inputs.
        const lockedAllowed = new Set([
          "/app/welcome",
          "/app/settings",
          "/app/data",
        ]);
        if (
          !profile.unlocked &&
          location.pathname.startsWith("/app") &&
          !lockedAllowed.has(location.pathname)
        ) {
          throw redirect({ to: "/app/welcome" });
        }
        // Unlocked accounts no longer need the welcome/booking screen.
        if (profile.unlocked && location.pathname === "/app/welcome") {
          throw redirect({ to: "/app/today" });
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
