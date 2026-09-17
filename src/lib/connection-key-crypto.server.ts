// Server-only AES-256-GCM encryption for App User Connector connection keys.
// Never import in the browser.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readServerEnv, loadCloudflareEnv } from "./server-env";

/**
 * Warms the runtime env cache. On the published site secrets arrive as worker
 * bindings, which can only be loaded asynchronously — call this once before
 * any encrypt/decrypt in a request.
 */
export async function warmSecretEnv(): Promise<void> {
  await loadCloudflareEnv();
}

/**
 * Candidate keys, in priority order.
 *
 * Provider tokens are written by the Supabase Edge Functions (oauth-callback)
 * and read back here on the app host. Those are two separate secret stores, so
 * the shared value must be one the operator sets identically in both places:
 * ACCOUNTING_TOKEN_KEY. APP_USER_CONNECTION_KEY_SECRET is kept as a fallback
 * for values written before the shared key existed.
 */
function keyCandidates(): Buffer[] {
  const names = ["ACCOUNTING_TOKEN_KEY", "APP_USER_CONNECTION_KEY_SECRET"];
  const keys: Buffer[] = [];
  for (const name of names) {
    const raw = readServerEnv(name);
    if (!raw) continue;
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) keys.push(buf);
  }
  return keys;
}

function key(): Buffer {
  const [first] = keyCandidates();
  if (!first) {
    throw new Error(
      "No token encryption key is set (ACCOUNTING_TOKEN_KEY or APP_USER_CONNECTION_KEY_SECRET, 32 bytes base64)",
    );
  }
  return first;
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const candidates = keyCandidates();
  if (candidates.length === 0) key(); // throws the descriptive "not set" error
  let lastError: unknown;
  for (const k of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Stored value does not match any configured token encryption key (${
      lastError instanceof Error ? lastError.message : String(lastError)
    })`,
  );
}

// ---- Backwards-compatible secret storage --------------------------------
// Historically some provider tokens were persisted as plaintext. New writes
// are always encrypted and tagged with a version prefix so reads can tell the
// two apart and keep working during the transition.
const ENC_PREFIX = "enc:v1:";

export function encryptSecret(plaintext: string): string {
  return ENC_PREFIX + encryptConnectionKey(plaintext);
}

export function isEncryptedSecret(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(ENC_PREFIX);
}

/** Decrypts a tagged value; returns legacy plaintext values unchanged. */
export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;
  return decryptConnectionKey(stored.slice(ENC_PREFIX.length));
}

export function decryptSecretOrNull(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  return decryptSecret(stored);
}
