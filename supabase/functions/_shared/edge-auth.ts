// Verifies the caller's own Supabase session (their logged-in ChAi account)
// from the Authorization header of a request to an Edge Function that is
// invoked directly from the browser. Mirrors requireSupabaseAuth in
// src/integrations/supabase/auth-middleware.ts: only a real, currently valid
// user access token yields a user id — nothing browser-supplied is trusted
// beyond that.
import { createClient } from "npm:@supabase/supabase-js@2";

export class UnauthorizedError extends Error {}

export async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new UnauthorizedError("No authorization header provided");
  if (!authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Only Bearer tokens are supported");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new UnauthorizedError("No token provided");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in the function environment.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new UnauthorizedError("Invalid or expired token");
  }
  return data.claims.sub as string;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://app.askchai.tech",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
