// Ties every browser-side cache (profile, ingested rows, AI summaries, churn
// overrides) to the user who owns it.
//
// Without this, switching accounts — or an admin impersonating a customer —
// paints the PREVIOUS account's cached data on first render, and only replaces
// it once the server round-trip finishes. Scoping the caches means a cache that
// belongs to a different user is dropped synchronously, before the first paint,
// so the user never sees someone else's numbers.

const OWNER_KEY = "chai.cache.owner";
// Impersonation state must survive the wipe: it holds the admin session needed
// to switch back.
const PRESERVED_KEYS = new Set(["chai.impersonation", OWNER_KEY]);

type ClearFn = () => void;
const scopedStores = new Set<ClearFn>();

/** Register an in-memory store to be emptied when the cache owner changes. */
export function registerScopedStore(clear: ClearFn): void {
  scopedStores.add(clear);
}

/**
 * The signed-in user id, read synchronously from the persisted auth session.
 * Returns null when signed out or when the session cannot be read.
 */
export function readLocalUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { user?: { id?: string }; currentSession?: { user?: { id?: string } } };
      const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (id) return id;
    }
  } catch {
    // Unreadable storage (private mode, non-JSON value) — treat as signed out.
  }
  return null;
}

function wipe(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("chai.") && !PRESERVED_KEYS.has(key)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage failures
  }
  for (const clear of scopedStores) {
    try {
      clear();
    } catch {
      // a failing store must not block the others
    }
  }
}

/**
 * Make sure the local caches belong to `userId`. Wipes them when they belong to
 * someone else. Safe to call repeatedly; only acts on an actual owner change.
 * Returns true when a wipe happened.
 */
export function ensureLocalCacheOwner(userId: string | null = readLocalUserId()): boolean {
  if (typeof window === "undefined") return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(OWNER_KEY);
  } catch {
    return false;
  }
  if (stored === (userId ?? "")) return false;

  // Signed out: keep whatever is cached so a page refresh mid-session doesn't
  // throw away the user's own data before the session is restored.
  if (!userId) return false;

  const changed = stored != null && stored !== userId;
  try {
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // ignore
  }
  if (changed) wipe();
  return changed;
}
