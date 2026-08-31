import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { impersonationEndReason } from "@/lib/impersonation-policy";

export const requireConnectedAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const supabaseUrl =
      process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const publishableKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      throw new Error("The backend connection is unavailable.");
    }

    const authorization = getRequest().headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Please sign in again");
    }

    const token = authorization.slice("Bearer ".length);
    if (!token) {
      throw new Error("Unauthorized: Please sign in again");
    }

    const supabase = createClient<Database>(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) {
      throw new Error("Unauthorized: Your session is invalid");
    }

    // A session-only, HttpOnly cookie binds target requests to the audit row.
    // It contains no credential and cannot be removed or forged by app code.
    const impersonationId = getCookie("chai-impersonation");
    if (impersonationId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: impersonation, error: impersonationError } = await supabaseAdmin
        .from("impersonation_audit")
        .select("started_at, ended_at")
        .eq("id", impersonationId)
        .eq("target_id", userId)
        .maybeSingle();
      if (impersonationError || !impersonation || impersonation.ended_at) {
        deleteCookie("chai-impersonation", { path: "/" });
        throw new Error("Unauthorized: Impersonation session is no longer active");
      }
      if (impersonationEndReason(impersonation.started_at) === "timeout") {
        const { error: closeError } = await supabaseAdmin
          .from("impersonation_audit")
          .update({ ended_at: new Date().toISOString(), end_reason: "timeout" })
          .eq("id", impersonationId)
          .eq("target_id", userId)
          .is("ended_at", null);
        if (closeError) throw closeError;
        deleteCookie("chai-impersonation", { path: "/" });
        throw new Error("Unauthorized: Impersonation session timed out");
      }
    }

    return next({
      context: { supabase, userId, claims: data.claims },
    });
  },
);