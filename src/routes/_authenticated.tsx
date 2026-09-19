import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getProfile } from "@/lib/profile.functions";
import { isDemoValue } from "@/lib/use-demo-mode";
import { clearVerifiedDemoToken, readDemoTokenFromUrl, verifyDemoToken } from "@/lib/demo-token";

import { checkAiConfig, type AiConfigCheckResult } from "@/lib/ai.functions";
import { resolveGuardedDestination } from "@/lib/post-login-destination";

declare global {
  interface Window {
    checkAiConfig?: () => Promise<AiConfigCheckResult>;
  }
}

function AuthenticatedLayout() {
  const runAiConfigCheck = useServerFn(checkAiConfig);

  useEffect(() => {
    window.checkAiConfig = () => runAiConfigCheck();
    return () => {
      delete window.checkAiConfig;
    };
  }, [runAiConfigCheck]);

  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, search }) => {
    // The /app/* pages can run on sample data for anonymous visitors, but only
    // when they came through the demo lead form and hold a valid, unexpired
    // server-issued token. Everything else requires login.
    const isAppPath = location.pathname.startsWith("/app");
    const demoFlag = isDemoValue((search as { demo?: unknown })?.demo);
    const demoToken = typeof (search as { demo_token?: unknown })?.demo_token === "string"
      ? ((search as { demo_token?: string }).demo_token ?? "").trim()
      : readDemoTokenFromUrl();

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
      if (isAppPath && demoFlag && demoToken && (await verifyDemoToken(demoToken))) {
        return { user: null };
      }
      clearVerifiedDemoToken();
      throw redirect({ to: "/auth", search: { redirect: location.href, mode: undefined, demo: false } });
    }





    // Signed-in users always land where their account state says they belong:
    // unfinished onboarding wins over everything else.
    try {
      const profile = await getProfile();
      const dest = resolveGuardedDestination(profile, location.pathname);
      if (dest) throw redirect({ href: dest });
    } catch (err) {
      if (isRedirect(err)) throw err;
      // If the profile can't be loaded, don't block the app.
    }

    return { user };
  },
  component: AuthenticatedLayout,
});
