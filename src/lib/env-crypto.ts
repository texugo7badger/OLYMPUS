/**
 * env-crypto.ts — AES-256-GCM encryption for ~/.olympus/.env values.
 *
 * API keys stored in ~/.olympus/.env are encrypted at rest using a
 * machine-derived key. This prevents credential exposure if the file is
 * read by an attacker with filesystem access.
 *
 * The encryption key is derived from:
 *   - Machine ID (os.machine())
 *   - Hostname
 *   - A fixed pepper ("olympus-env-crypto-v1")
 *
 * Values are stored as: enc:<base64(iv + authTag + ciphertext)>
 * Unencrypted values (without "enc:" prefix) pass through as-is for
 * backward compatibility.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { hostname, machine } from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits
const PREFIX = 'enc:';
const PEPPER = 'olympus-env-crypto-v1';

/**
 * Derive a 256-bit key from machine-specific identifiers.
 * This ensures the encrypted file can only be decrypted on the same machine.
 */
function deriveKey(): Buffer {
  const seed = `${hostname()}:${machine()}:${PEPPER}`;
  return createHash('sha256').update(seed).digest();
}

/**
 * Encrypt a plaintext value.
 * Returns a string in the format: enc:base64(iv + authTag + ciphertext)
 */
export function encryptValue(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv (12) + authTag (16) + ciphertext (variable)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + combined.toString('base64url');
}

/**
 * Decrypt a value that was encrypted with encryptValue().
 * Unencrypted values (no "enc:" prefix) pass through unchanged.
 * Returns null if decryption fails.
 */
export function decryptValue(encoded: string): string | null {
  if (!encoded || typeof encoded !== 'string') return encoded;
  if (!encoded.startsWith(PREFIX)) return encoded; // plaintext pass-through
  try {
    const key = deriveKey();
    const raw = Buffer.from(encoded.slice(PREFIX.length), 'base64url');
    if (raw.length < IV_LENGTH + TAG_LENGTH) return null;
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = decipher.update(ciphertext) + decipher.final('utf-8');
    // Detect double encryption: if the result itself starts with "enc:",
    // decrypt again. This handles the bug where encryptValue() was called
    // on already-encrypted data.
    if (decrypted.startsWith(PREFIX)) {
      try {
        const innerKey = deriveKey();
        const innerRaw = Buffer.from(decrypted.slice(PREFIX.length), 'base64url');
        if (innerRaw.length >= IV_LENGTH + TAG_LENGTH) {
          const innerIv = innerRaw.subarray(0, IV_LENGTH);
          const innerTag = innerRaw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
          const innerCiphertext = innerRaw.subarray(IV_LENGTH + TAG_LENGTH);
          const innerDecipher = createDecipheriv(ALGORITHM, innerKey, innerIv);
          innerDecipher.setAuthTag(innerTag);
          return innerDecipher.update(innerCiphertext) + innerDecipher.final('utf-8');
        }
      } catch {
        // Double decryption failed — return the single-decrypted value
        // (which may be garbage, but at least it's not null)
      }
    }
    return decrypted;
  } catch {
    return null; // decryption failed — caller should handle
  }
}

/**
 * Parse a .env file content and return decrypted key-value pairs.
 * Handles both encrypted (enc:...) and plaintext values.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!key) continue;
    const decrypted = decryptValue(value);
    if (decrypted !== null) {
      result[key] = decrypted;
    }
  }
  return result;
}

/**
 * Build .env file content from key-value pairs, encrypting values.
 * Preserves leading comment lines.
 */
export function buildEnvContent(entries: Record<string, string>, headerComment?: string): string {
  const lines: string[] = [];
  if (headerComment) lines.push(headerComment);
  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      lines.push(`${key}=${encryptValue(value)}`);
    }
  }
  return lines.join('\n') + '\n';
}
