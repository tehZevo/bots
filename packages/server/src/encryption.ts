import { createCipheriv, createDecipheriv } from "node:crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SECRETS_KEY must be 32 random bytes encoded as hex");
  }
  return Buffer.from(value, "hex");
}

export function currentEncryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.SECRETS_KEY);
}

export function previousEncryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.SECRETS_KEY_OLD);
}

function requireCurrentKey(): Buffer {
  const key = currentEncryptionKey();
  if (!key) throw new Error("SECRETS_KEY is required to store encrypted data");
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptWithKey(value: string, key: Buffer): string {
  if (!value) return "";
  const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(IV_BYTES)));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptWithKey(stored: string, key: Buffer): string {
  if (!isEncrypted(stored)) return stored;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("encrypted value is malformed");
  const iv = Buffer.from(parts[0], "base64url");
  const tag = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("encrypted value is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptSecret(value: string): string {
  return encryptWithKey(value, requireCurrentKey());
}

export function decryptSecret(
  stored: string,
  label = "encrypted data",
): string {
  if (!isEncrypted(stored)) return stored;
  try {
    return decryptWithKey(stored, requireCurrentKey());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to decrypt ${label}: ${reason}`);
  }
}
