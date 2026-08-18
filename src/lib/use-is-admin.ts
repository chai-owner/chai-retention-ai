// Tells the UI whether the current session may perform admin-only actions.
// True when the signed-in user holds the 'admin' role, or when an admin is
// currently impersonating this user (the stored admin session proves it).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/admin.functions";
import { useImpersonation } from "@/lib/impersonation";

export function useIsAdmin(): boolean {
  const impersonation = useImpersonation();
  const check = useServerFn(checkIsAdmin);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    check()
      .then((res) => {
        if (!cancelled) setIsAdmin(Boolean(res));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

  return isAdmin || impersonation !== null;
}
