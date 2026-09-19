// Demo mode is driven by `?demo=1` plus a server-issued `demo_token`, both
// retained across navigation (see the root route's retainSearchParams
// middleware). Sample data only ever shows when that token has been verified
// server-side for this tab — a copy-pasted `?demo=true` URL grants nothing.
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSignedIn } from "@/lib/use-auth-state";
import { isDemoTokenVerified, readDemoTokenFromUrl } from "@/lib/demo-token";

export function isDemoValue(raw: unknown): boolean {
  return raw === true || raw === "1" || raw === "true";
}

export function useDemoMode(): boolean {
  // Re-read whenever the location changes so navigating in/out of demo updates.
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const signedIn = useSignedIn();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = readDemoTokenFromUrl();
    setDemo(isDemoValue(params.get("demo")) && isDemoTokenVerified(token));
  }, [searchStr]);
  // Signed-in users never see demo data — the `?demo=1` flag is ignored.
  if (signedIn) return false;
  return demo;
}

