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

  return { value: undefined, source: "missing", checkedSources: CHECKED_SOURCES };
}

export function readServerEnv(name: string): string | undefined {
  return inspectServerEnv(name).value;
}
