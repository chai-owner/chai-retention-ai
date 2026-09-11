// Loads the privileged service-role client in a way that works in every
// runtime this app deploys to.
//
// The generated `@/integrations/supabase/client.server` reads SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from `process.env`. That is fine in the preview
// (Node), but on the published site the app runs as a Cloudflare Worker where
// secrets are delivered as worker bindings, not process env vars — so the
// direct import threw "Missing Supabase environment variable(s)" in
// production even though the credentials existed. Here we warm the worker
// bindings first and mirror them onto process.env before the generated client
// reads them.
import { loadCloudflareEnv } from "./server-env";

export async function loadSupabaseAdmin() {
  const env = await loadCloudflareEnv();
  if (env) {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process;
    if (proc?.env) {
      if (!proc.env.SUPABASE_URL && env.SUPABASE_URL) {
        proc.env.SUPABASE_URL = env.SUPABASE_URL;
      }
      if (!proc.env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY) {
        proc.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
      }
    }
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
