// Resilient server-side environment lookup.
//
// Depending on the runtime (Node dev server, Cloudflare Worker, Nitro preset),
// secrets can arrive on `process.env` or on a runtime-provided env object
// attached to `globalThis`. Reading only `process.env` makes a server function
// fail with "not configured" even though the secret exists.
export function readServerEnv(name: string): string | undefined {
  const g = globalThis as unknown as Record<string, unknown>;

  const fromProcess = (g.process as { env?: Record<string, string | undefined> } | undefined)?.env?.[name];
  if (fromProcess) return fromProcess;

  const candidates: Array<Record<string, string | undefined> | undefined> = [
    g.__env__ as Record<string, string | undefined> | undefined,
    g.env as Record<string, string | undefined> | undefined,
    (g.Deno as { env?: { get(key: string): string | undefined } } | undefined)?.env
      ? { [name]: (g.Deno as { env: { get(key: string): string | undefined } }).env.get(name) }
      : undefined,
  ];

  for (const source of candidates) {
    const value = source?.[name];
    if (value) return value;
  }

  return undefined;
}
