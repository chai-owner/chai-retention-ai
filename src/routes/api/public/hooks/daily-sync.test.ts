// Tier 4 — the daily sync endpoint is public (pg_cron calls it), so the shared
// secret is the only thing standing between the internet and everyone's data.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Route } from "@/routes/api/public/hooks/daily-sync";
import { setDefaultSupabaseResult } from "@/test/setup";

const fetchAndNormalize = vi.fn(async () => []);
const runCrmSync = vi.fn(async () => []);
const runSupportSync = vi.fn(async () => ({ datasets: [], rows: 0 }));
const persistDatasetsAdmin = vi.fn(
  async (): Promise<{ batchIds: string[]; totalRows: number }> => ({ batchIds: [], totalRows: 0 }),
);


vi.mock("@/lib/accounting.server", () => ({ fetchAndNormalize: (...a: unknown[]) => fetchAndNormalize(...(a as [])) }));
vi.mock("@/lib/crm.server", () => ({
  runCrmSync: (...a: unknown[]) => runCrmSync(...(a as [])),
  markCrmSynced: vi.fn(async () => {}),
}));
vi.mock("@/lib/support.server", () => ({
  runSupportSync: (...a: unknown[]) => runSupportSync(...(a as [])),
  markSupportSynced: vi.fn(async () => {}),
}));
vi.mock("@/lib/sync-persist.server", () => ({
  persistDatasetsAdmin: (...a: unknown[]) => persistDatasetsAdmin(...(a as [])),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const POST = (Route as any).options.server.handlers.POST as (ctx: {
  request: Request;
}) => Promise<Response>;

function call(secret?: string) {
  return POST({
    request: new Request("https://app.test/api/public/hooks/daily-sync", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-cron-secret": secret },
    }),
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  setDefaultSupabaseResult({ data: [] });
  vi.clearAllMocks();
});

describe("daily sync endpoint auth", () => {
  it("rejects a request with no secret", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a wrong secret of the same length", async () => {
    expect((await call("test-cron-secreT")).status).toBe(401);
  });

  it("rejects a wrong secret of a different length", async () => {
    expect((await call("short")).status).toBe(401);
  });

  it("rejects everything when the server secret is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("anything")).status).toBe(401);
  });

  it("never runs a sync for an unauthorized caller", async () => {
    await call("nope");
    expect(runCrmSync).not.toHaveBeenCalled();
    expect(fetchAndNormalize).not.toHaveBeenCalled();
    expect(runSupportSync).not.toHaveBeenCalled();
  });

  it("accepts the correct secret", async () => {
    const res = await call("test-cron-secret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });
});

describe("daily sync run", () => {
  it("syncs each connected integration and reports per-connection results", async () => {
    setDefaultSupabaseResult({
      data: [{ user_id: "user-1", provider: "hubspot", last_synced_at: "2026-05-01T00:00:00Z" }],
    });
    persistDatasetsAdmin.mockResolvedValue({ batchIds: ["b1"], totalRows: 4 });

    const body = await (await call("test-cron-secret")).json();

    // One accounting + one CRM + one support connection from the stubbed rows.
    expect(body.results).toHaveLength(3);
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(body.results.map((r: { rows: number }) => r.rows)).toEqual([4, 4, 4]);
  });

  it("passes the stored cursor so only changed records are pulled", async () => {
    setDefaultSupabaseResult({
      data: [{ user_id: "user-1", provider: "hubspot", last_synced_at: "2026-05-01T00:00:00Z" }],
    });
    await call("test-cron-secret");
    expect(runCrmSync).toHaveBeenCalledWith("hubspot", "user-1", 500, "2026-05-01T00:00:00Z");
    expect(fetchAndNormalize).toHaveBeenCalledWith("user-1", "hubspot", "2026-05-01T00:00:00Z");
  });

  it("keeps going when one connection fails and records the error", async () => {
    setDefaultSupabaseResult({
      data: [{ user_id: "user-1", provider: "hubspot", last_synced_at: null }],
    });
    runCrmSync.mockRejectedValueOnce(new Error("token expired"));

    const body = await (await call("test-cron-secret")).json();
    const crm = body.results.find((r: { source: string }) => r.source === "crm");
    expect(crm.ok).toBe(false);
    expect(crm.error).toBe("token expired");
    // The support sync still ran despite the CRM failure.
    expect(runSupportSync).toHaveBeenCalled();
  });
});
