import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

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

    return next({
      context: { supabase, userId, claims: data.claims },
    });
  },
);