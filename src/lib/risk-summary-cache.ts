// Persists AI-generated "needs attention" one-liners so the dashboard only
// re-calls the model at most once every 24 hours (or when the set of at-risk
// accounts changes). Backed by localStorage; SSR-safe (no-ops on the server).

const STORAGE_KEY = "chai.dashboard.riskSummaries";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheShape {
  generatedAt: number;
  key: string; // identifies the set of accounts the summaries were built for
  summaries: Record<string, string>;
}

function read(): CacheShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : null;
  } catch {
    return null;
  }
}

// Returns cached summaries when they're fresh (<24h) AND built for the same set
// of accounts. Otherwise returns null, signalling the caller to regenerate.
export function getCachedRiskSummaries(key: string): Record<string, string> | null {
  const cache = read();
  if (!cache) return null;
  if (cache.key !== key) return null;
  if (Date.now() - cache.generatedAt > MAX_AGE_MS) return null;
  return cache.summaries;
}

export function setCachedRiskSummaries(key: string, summaries: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheShape = { generatedAt: Date.now(), key, summaries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore write failures (private mode / quota)
  }
}
