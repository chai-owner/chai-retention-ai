import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
      throw redirect({ to: "/auth", search: { redirect: location.href, mode: undefined, demo: false } });
    }

    const path = location.pathname;

    // New signups must add payment details (2-week free trial) before we ask
    // for company information in onboarding.
    if (path !== "/start-trial" && path !== "/admin" && !path.startsWith("/app/billing")) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lapsed = !sub || sub.status === "CANCELLED" || sub.status === "EXPIRED";
      if (lapsed) throw redirect({ to: "/start-trial" });
    }

    // Force signed-in users who haven't finished onboarding into the flow.
    if (path !== "/onboarding" && path !== "/admin" && path !== "/start-trial") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded, unlocked")
        .eq("id", user.id)
        .maybeSingle();

      // Fail closed: if we can't confirm onboarding, send them through it.
      if (!profile?.onboarded) throw redirect({ to: "/onboarding" });

      // Onboarded but not yet unlocked by an admin: keep them on the
      // insights/booking screen. They may still revisit Business Profile
      // and Data to improve their inputs.
      const lockedAllowed = new Set(["/app/welcome", "/app/settings", "/app/data"]);
      if (!profile.unlocked && path.startsWith("/app") && !lockedAllowed.has(path)) {
        throw redirect({ to: "/app/welcome" });
      }
    }

    return { user };
  },
  component: () => <Outlet />,
});

