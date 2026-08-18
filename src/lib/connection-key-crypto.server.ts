// Server-only AES-256-GCM encryption for App User Connector connection keys.
// Never import in the browser.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return Buffer.from(raw, "base64");
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
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
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
