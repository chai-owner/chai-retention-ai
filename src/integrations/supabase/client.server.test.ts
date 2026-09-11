import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service-role client must resolve its credentials in both runtimes:
// preview (process.env) and the published Cloudflare Worker (bindings exposed
// on globalThis rather than process.env).
describe("supabaseAdmin credential lookup", () => {
  const ORIGINAL_URL = process.env.SUPABASE_URL;
  const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete g.env;
    delete g.__env__;
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = ORIGINAL_URL;
    if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
    delete g.env;
    delete g.__env__;
  });

  it("creates the client from process.env credentials (preview/dev)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { supabaseAdmin } = await import("./client.server");
    expect(supabaseAdmin).toBeTruthy();
    expect(typeof supabaseAdmin.from).toBe("function");
  });

  it("creates the client from worker-style globalThis.env bindings (production)", async () => {
    g.env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };
    const { supabaseAdmin } = await import("./client.server");
    expect(typeof supabaseAdmin.from).toBe("function");
  });

  it("throws the missing-variable error only when no source has the credentials", async () => {
    // Query suffix forces a fresh module instance: the earlier tests already
    // created and cached a client inside their module's lazy singleton.
    const { supabaseAdmin } = await import("./client.server?fresh=missing");
    expect(() => supabaseAdmin.from("profiles")).toThrow(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
  });
});
