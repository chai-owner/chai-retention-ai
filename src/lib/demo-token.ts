// Client-side bookkeeping for the demo access token. The token itself travels
// in the URL (`?demo=true&demo_token=…`) so it survives in-app navigation; once
// the server has confirmed it, we remember that verdict for the tab so every
// page doesn't re-check on each navigation.
const STORAGE_KEY = "chai.demo-token";

interface StoredDemoToken {
  token: string;
  expiresAt: number;
}

export function readDemoTokenFromUrl(search?: string): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(search ?? window.location.search);
  return (params.get("demo_token") ?? "").trim();
}

export function rememberVerifiedDemoToken(token: string, expiresAt?: string | null) {
  if (typeof window === "undefined" || !token) return;
  const ts = expiresAt ? Date.parse(expiresAt) : NaN;
  const payload: StoredDemoToken = {
    token,
    expiresAt: Number.isFinite(ts) ? ts : Date.now() + 90 * 60_000,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode: fall back to re-verifying on each navigation */
  }
}

export function clearVerifiedDemoToken() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when this tab has already had the server confirm exactly this token. */
export function isDemoTokenVerified(token: string): boolean {
  if (typeof window === "undefined" || !token) return false;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredDemoToken;
    return parsed.token === token && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

/** Asks the server whether the token is real and unexpired. */
export async function verifyDemoToken(token: string): Promise<boolean> {
  if (!token) return false;
  if (isDemoTokenVerified(token)) return true;
  try {
    const res = await fetch("/api/public/demo-access/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { valid?: boolean; expiresAt?: string };
    if (!data.valid) {
      clearVerifiedDemoToken();
      return false;
    }
    rememberVerifiedDemoToken(token, data.expiresAt ?? null);
    return true;
  } catch {
    return false;
  }
}
