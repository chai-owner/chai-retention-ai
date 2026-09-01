// Tracks whether a real user session exists. Used to decide between the public,
// no-login demo (sample data) and a signed-in user's real workspace (their own
// uploaded/synced data only — never sample data).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSignedIn(!!data.session);
      })
      .catch((err) => {
        console.error("[auth] getSession failed; treating as signed out", err);
        if (active) setSignedIn(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session),
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

// Current user's id (null when signed out, undefined while resolving). Used to
// scope per-user client caches so one account never sees another's AI output.
export function useAuthUserId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user.id ?? null);
      })
      .catch((err) => {
        console.error("[auth] getSession failed; treating as signed out", err);
        if (active) setUserId(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user.id ?? null),
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return userId;
}
