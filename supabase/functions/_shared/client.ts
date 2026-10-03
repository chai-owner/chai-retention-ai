// Server-side Supabase client with service role key - bypasses RLS.
// Ported from src/integrations/supabase/client.server.ts (TanStack Start app).
// On Supabase Edge Functions, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// automatically injected into the function's environment.
import { createClient } from "npm:@supabase/supabase-js@2";

export async function getSupabaseAdmin() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}.`);
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
