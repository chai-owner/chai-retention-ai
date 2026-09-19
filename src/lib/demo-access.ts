// Pure helpers behind the token-gated public demo. Kept free of any database
// or browser API so they can be unit tested directly.

export const DEMO_TOKEN_TTL_MINUTES = 90;
export const DEMO_RATE_LIMIT_PER_HOUR = 5;
export const DEMO_RATE_LIMIT_WINDOW_MINUTES = 60;

export interface DemoLeadInput {
  name: string;
  email: string;
  company: string;
  website: string | null;
}

export type DemoLeadValidation =
  | { ok: true; value: DemoLeadInput }
  | { ok: false; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateDemoLead(raw: unknown): DemoLeadValidation {
  const body = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(body.name).slice(0, 120);
  const email = str(body.email).slice(0, 200);
  const company = str(body.company).slice(0, 160);
  const website = str(body.website).slice(0, 300);

  if (!name || !email || !company) {
    return { ok: false, message: "Please fill in your name, email and company." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  return { ok: true, value: { name, email, company, website: website || null } };
}

/** Cryptographically random, URL-safe token. */
export function generateDemoToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function demoTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEMO_TOKEN_TTL_MINUTES * 60_000);
}

export function isDemoTokenExpired(expiresAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const ts = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return !Number.isFinite(ts) || ts <= now;
}

export function isDemoRateLimited(attemptsInWindow: number): boolean {
  return attemptsInWindow >= DEMO_RATE_LIMIT_PER_HOUR;
}

/** Best-effort caller IP from edge/proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "";
  if (forwarded.trim()) return forwarded.trim();
  const xff = headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || "unknown";
}

/** Stored hashed so the leads table never holds raw visitor IPs. */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`demo:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
