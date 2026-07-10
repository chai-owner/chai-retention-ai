// Tracks whether a real user session exists. Used to decide between the public,
// no-login demo (sample data) and a signed-in user's real workspace (their own
// uploaded/synced data only — never sample data).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
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
