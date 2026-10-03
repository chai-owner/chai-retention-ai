// The cron endpoints are public URLs, so this check is the only thing between
// the internet and every account's data.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth.server";
import { Route } from "@/routes/api/public/hooks/daily-score";
import { setDefaultSupabaseResult } from "@/test/setup";

const CRON = "test-cron-secret";
const ROLE = "test-service-role-key-0123456789";
const saved = { cron: process.env.CRON_SECRET, role: process.env.SUPABASE_SERVICE_ROLE_KEY };

function req(headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/public/hooks/daily-score", { method: "POST", headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ROLE;
  setDefaultSupabaseResult({ data: [] });
});

afterEach(() => {
  if (saved.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved.cron;
  if (saved.role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.role;
});

describe("isCronAuthorized", () => {
  it("rejects no credentials", async () => {
    expect(await isCronAuthorized(req())).toBe(false);
  });

  it("accepts the cron secret header", async () => {
    expect(await isCronAuthorized(req({ "x-cron-secret": CRON }))).toBe(true);
  });

  it("rejects a wrong cron secret of the same and of a different length", async () => {
    expect(await isCronAuthorized(req({ "x-cron-secret": "test-cron-secreT" }))).toBe(false);
    expect(await isCronAuthorized(req({ "x-cron-secret": "short" }))).toBe(false);
  });

  it("accepts the service-role key as a Bearer token", async () => {
    expect(await isCronAuthorized(req({ authorization: `Bearer ${ROLE}` }))).toBe(true);
    expect(await isCronAuthorized(req({ authorization: `bearer  ${ROLE} ` }))).toBe(true);
  });

  it("rejects a wrong or malformed Bearer token", async () => {
    expect(await isCronAuthorized(req({ authorization: `Bearer ${ROLE}x` }))).toBe(false);
    expect(await isCronAuthorized(req({ authorization: ROLE }))).toBe(false);
    expect(await isCronAuthorized(req({ authorization: "Bearer " }))).toBe(false);
  });

  it("does not accept one secret in the other's slot", async () => {
    expect(await isCronAuthorized(req({ authorization: `Bearer ${CRON}` }))).toBe(false);
    expect(await isCronAuthorized(req({ "x-cron-secret": ROLE }))).toBe(false);
  });

  it("rejects everything when both server values are unset", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await isCronAuthorized(req({ "x-cron-secret": "" }))).toBe(false);
    expect(await isCronAuthorized(req({ authorization: "Bearer " }))).toBe(false);
    expect(await isCronAuthorized(req({ "x-cron-secret": "anything" }))).toBe(false);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const POST = (Route as any).options.server.handlers.POST as (ctx: {
  request: Request;
}) => Promise<Response>;

describe("daily-score endpoint", () => {
  it("returns 401 for an unauthorized caller", async () => {
    const res = await POST({ request: req({ "x-cron-secret": "nope" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    // Diagnostics say what exists, never the values.
    expect(body.check).toEqual({
      server_has_cron_secret: true,
      server_has_service_role: true,
      sent_cron_header: true,
      sent_bearer: false,
      cron_secret_length_matches: false,
    });
    expect(JSON.stringify(body)).not.toContain(CRON);
    expect(JSON.stringify(body)).not.toContain(ROLE);
  });

  it("runs for the Edge Function's Bearer token", async () => {
    const res = await POST({ request: req({ authorization: `Bearer ${ROLE}` }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("still runs for pg_cron's secret header", async () => {
    const res = await POST({ request: req({ "x-cron-secret": CRON }) });
    expect(res.status).toBe(200);
  });
});
