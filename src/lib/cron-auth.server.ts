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

export interface CronAuthCheck {
  ok: boolean;
  /** Safe-to-share diagnostics: which secrets exist and were sent. Never values. */
  check: {
    server_has_cron_secret: boolean;
    server_has_service_role: boolean;
    sent_cron_header: boolean;
    sent_bearer: boolean;
    cron_secret_length_matches: boolean;
  };
}

export async function checkCronAuth(request: Request): Promise<CronAuthCheck> {
  const [cronSecret, serviceRoleKey] = await Promise.all([
    readServerEnvAsync("CRON_SECRET"),
    readServerEnvAsync("SUPABASE_SERVICE_ROLE_KEY"),
  ]);
  const sentCron = request.headers.get("x-cron-secret") ?? "";
  const sentBearer = bearerToken(request);
  const ok = safeEqual(sentCron, cronSecret) || safeEqual(sentBearer, serviceRoleKey);
  return {
    ok,
    check: {
      server_has_cron_secret: Boolean(cronSecret),
      server_has_service_role: Boolean(serviceRoleKey),
      sent_cron_header: sentCron.length > 0,
      sent_bearer: sentBearer.length > 0,
      cron_secret_length_matches: Boolean(cronSecret) && sentCron.length === cronSecret!.length,
    },
  };
}

export async function isCronAuthorized(request: Request): Promise<boolean> {
  return (await checkCronAuth(request)).ok;
}

export function unauthorizedResponse(check?: CronAuthCheck["check"]): Response {
  return new Response(
    JSON.stringify(check ? { error: "unauthorized", check } : { error: "unauthorized" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}
