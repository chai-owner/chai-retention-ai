// Resilient server-side environment lookup.
//
// Depending on the runtime (Node dev server, Cloudflare Worker, Nitro preset),
// secrets can arrive on `process.env` or on a runtime-provided env object
// attached to `globalThis`. Reading only `process.env` makes a server function
// fail with "not configured" even though the secret exists.
export type ServerEnvSource =
  | "process.env"
  | "globalThis.__env__"
  | "globalThis.env"
  | "Deno.env"
  | "cloudflare:workers"
  | "missing";

export interface ServerEnvLookup {
  value: string | undefined;
  source: ServerEnvSource;
  checkedSources: readonly string[];
}

const CHECKED_SOURCES = [
  "process.env",
  "globalThis.__env__",
  "globalThis.env",
  "Deno.env",
  "cloudflare:workers",
] as const;


export function inspectServerEnv(name: string): ServerEnvLookup {
  const g = globalThis as unknown as Record<string, unknown>;

  const fromProcess = (g.process as { env?: Record<string, string | undefined> } | undefined)?.env?.[name];
  if (fromProcess) {
    return { value: fromProcess, source: "process.env", checkedSources: CHECKED_SOURCES };
  }

  const candidates: Array<{
    source: Exclude<ServerEnvSource, "process.env" | "missing">;
    value: string | undefined;
  }> = [
    {
      source: "globalThis.__env__",
      value: (g.__env__ as Record<string, string | undefined> | undefined)?.[name],
    },
    {
      source: "globalThis.env",
      value: (g.env as Record<string, string | undefined> | undefined)?.[name],
    },
    {
      source: "Deno.env",
      value: (g.Deno as { env?: { get(key: string): string | undefined } } | undefined)?.env?.get(name),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.value) {
      return {
        value: candidate.value,
        source: candidate.source,
        checkedSources: CHECKED_SOURCES,
      };
    }
  }

  const fromCloudflare = cloudflareEnv?.[name];
  if (fromCloudflare) {
    return { value: fromCloudflare, source: "cloudflare:workers", checkedSources: CHECKED_SOURCES };
  }

  return { value: undefined, source: "missing", checkedSources: CHECKED_SOURCES };
}

export function readServerEnv(name: string): string | undefined {
  return inspectServerEnv(name).value;
}

// ---------------------------------------------------------------------------
// Cloudflare Workers bindings
//
// On the published site the app runs as a Cloudflare Worker, where secrets are
// delivered as bindings on the worker `env` object rather than on `process.env`.
// The binding module can only be imported at runtime, so it is loaded lazily
// and cached; the synchronous lookup above uses the cached copy once warmed.
// ---------------------------------------------------------------------------

let cloudflareEnv: Record<string, string | undefined> | null = null;

export async function loadCloudflareEnv(): Promise<Record<string, string | undefined> | null> {
  if (cloudflareEnv) return cloudflareEnv;
  try {
    // Built from a variable so bundlers don't try to resolve it at build time.
    const specifier = ["cloudflare", "workers"].join(":");
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      env?: Record<string, string | undefined>;
    };
    cloudflareEnv = mod?.env ?? null;
  } catch {
    cloudflareEnv = null;
  }
  return cloudflareEnv;
}

/** Same as {@link inspectServerEnv}, but also consults Cloudflare Worker bindings. */
export async function inspectServerEnvAsync(name: string): Promise<ServerEnvLookup> {
  const direct = inspectServerEnv(name);
  if (direct.value) return direct;

  const env = await loadCloudflareEnv();
  const value = env?.[name];
  if (value) {
    return { value, source: "cloudflare:workers", checkedSources: CHECKED_SOURCES };
  }
  return direct;
}

export async function readServerEnvAsync(name: string): Promise<string | undefined> {
  return (await inspectServerEnvAsync(name)).value;
}
