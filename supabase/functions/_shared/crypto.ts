// Server-only AES-256-GCM encryption for connection keys / OAuth tokens.
// Ported verbatim from src/lib/connection-key-crypto.server.ts.
//
// Tokens written here (inside the Supabase Edge Functions) are read back on
// the app's own hosting (src/lib/accounting.server.ts) and vice versa — two
// separate secret stores. ACCOUNTING_TOKEN_KEY is the one value the operator
// sets identically in both places (Project Settings -> Secrets, and here as
// a Supabase project secret) so encryption/decryption actually agree.
// APP_USER_CONNECTION_KEY_SECRET is kept as a decrypt-only fallback for any
// values written before ACCOUNTING_TOKEN_KEY existed. Generate a new key
// with: openssl rand -base64 32
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

function keyCandidates(): Buffer[] {
  const names = ["ACCOUNTING_TOKEN_KEY", "APP_USER_CONNECTION_KEY_SECRET"];
  const keys: Buffer[] = [];
  for (const name of names) {
    const raw = Deno.env.get(name);
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

const ENC_PREFIX = "enc:v1:";

export function encryptSecret(plaintext: string): string {
  return ENC_PREFIX + encryptConnectionKey(plaintext);
}

export function isEncryptedSecret(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(ENC_PREFIX);
}

export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;
  return decryptConnectionKey(stored.slice(ENC_PREFIX.length));
}

export function decryptSecretOrNull(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  return decryptSecret(stored);
}
