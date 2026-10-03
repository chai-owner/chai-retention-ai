// Shared auth for the public cron endpoints (/api/public/hooks/*).
//
// A caller is trusted when it presents either:
//   1. the CRON_SECRET in the `x-cron-secret` header (pg_cron's scheme), or
//   2. the project's service-role key as `Authorization: Bearer <key>`.
//
// (2) lets the nightly Supabase Edge Function forward to this app without a
// new shared secret: both runtimes already hold the same service-role key.
// Secrets are read with the resilient env lookup (process.env alone is empty
// on the published Worker). Comparisons are constant-time; an unset server
// value never matches anything.
import { timingSafeEqual } from "crypto";
import { readServerEnvAsync } from "@/lib/server-env";

function safeEqual(provided: string, expected: string | undefined): boolean {
  if (!expected || !provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : "";
}

export async function isCronAuthorized(request: Request): Promise<boolean> {
  const [cronSecret, serviceRoleKey] = await Promise.all([
    readServerEnvAsync("CRON_SECRET"),
    readServerEnvAsync("SUPABASE_SERVICE_ROLE_KEY"),
  ]);
  if (safeEqual(request.headers.get("x-cron-secret") ?? "", cronSecret)) return true;
  return safeEqual(bearerToken(request), serviceRoleKey);
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
