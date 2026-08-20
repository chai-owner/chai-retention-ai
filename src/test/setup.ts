// Global test setup: DOM matchers, deterministic env, and a Supabase mock so
// nothing in the suite ever touches the real backend or a provider API.
import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";

// --- Environment ----------------------------------------------------------
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.CRON_SECRET ??= "test-cron-secret";
// 32 zero bytes, base64 — deterministic key for token-at-rest encryption tests.
process.env.APP_USER_CONNECTION_KEY_SECRET ??= Buffer.alloc(32, 7).toString("base64");


// --- Supabase client mocks ------------------------------------------------
// A tiny chainable stub: every query builder method returns `this`, and the
// thenable resolves to { data, error }. Tests override results via
// `setSupabaseResult`.
type Result = { data: unknown; error: unknown };
const results = new Map<string, Result>();
let defaultResult: Result = { data: [], error: null };

export function setSupabaseResult(table: string, result: Partial<Result>) {
  results.set(table, { data: null, error: null, ...result });
}
export function setDefaultSupabaseResult(result: Partial<Result>) {
  defaultResult = { data: null, error: null, ...result };
}
export function resetSupabaseResults() {
  results.clear();
  defaultResult = { data: [], error: null };
}

function makeBuilder(table: string) {
  const resolve = () => results.get(table) ?? defaultResult;
  const builder: Record<string, unknown> = {};
  const chain = [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "order",
    "limit",
    "range",
    "filter",
    "not",
    "or",
    "match",
  ];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(async () => resolve());
  builder.maybeSingle = vi.fn(async () => resolve());
  builder.then = (onFulfilled: (r: Result) => unknown) => Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

export const supabaseMock = {
  from: vi.fn((table: string) => makeBuilder(table)),
  rpc: vi.fn(async () => ({ data: null, error: null })),
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseMock,
}));

beforeEach(() => {
  resetSupabaseResults();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
