// Nightly scoring trigger. pg_cron calls this function; it forwards to the
// app's /api/public/hooks/daily-score route, which runs the real scoring code
// from src/lib. There is deliberately no scoring logic here any more: the old
// hand-ported copy (still in _shared/customer-scoring.ts, now unused by this
// function) had drifted from the app, so nightly scores missed scoring fixes.
//
// Auth in:  pg_cron's CRON_SECRET in the x-cron-secret header (unchanged).
// Auth out: the project's service-role key as a Bearer token, plus the same
//           x-cron-secret, so either matching secret on the app side works.
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "https://app.askchai.tech").replace(/\/+$/, "");
const TARGET = `${APP_BASE_URL}/api/public/hooks/daily-score`;
const TIMEOUT_MS = 140_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function authorized(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!expected || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "x-cron-secret": cronSecret,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[daily-score] app returned ${res.status}: ${text.slice(0, 500)}`);
      return json({ ok: false, forwarded_to: TARGET, app_status: res.status, app_body: text.slice(0, 2000) }, 502);
    }
    console.log(`[daily-score] app ok: ${text.slice(0, 500)}`);
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[daily-score] forward failed: ${message}`);
    return json({ ok: false, forwarded_to: TARGET, error: message }, 502);
  }
});
