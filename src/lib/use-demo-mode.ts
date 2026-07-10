// Demo mode is driven by a `?demo=1` search param that is retained across
// navigation (see the root route's retainSearchParams middleware). When on,
// every /app page shows the illustrative sample dataset and skips the
// signed-in onboarding/welcome redirects — so a logged-in user can view the
// public product demo without seeing any of their own real data.
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function isDemoValue(raw: unknown): boolean {
  return raw === true || raw === "1" || raw === "true";
}

export function useDemoMode(): boolean {
  // Re-read whenever the location changes so navigating in/out of demo updates.
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDemo(isDemoValue(params.get("demo")));
  }, [searchStr]);
  return demo;
}
