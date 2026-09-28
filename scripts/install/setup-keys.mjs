#!/usr/bin/env node
/**
 * setup-keys.mjs — Manual API key setup helper for OLYMPUS.
 *
 * Not called by the installer anymore — LLM keys are managed inside
 * OpenCode (`olympus opencode` → Settings → Providers). This script
 * remains as a legacy CLI fallback for headless/unattended setups
 * (writes encrypted keys to ~/.olympus/.env).
 *
 * Usage:
 *   node scripts/install/setup-keys.mjs
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { hostname, machine } from 'node:os';

const OLYMPUS_HOME = join(process.env.HOME || process.env.USERPROFILE || '~', '.olympus');
const DOT_ENV = join(OLYMPUS_HOME, '.env');

function encryptValue(plaintext) {
  if (!plaintext) return plaintext;
  const key = createHash('sha256').update(`${hostname()}:${machine()}:olympus-env-crypto-v1`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

const key = process.argv[2];
const value = process.argv[3];

if (!key || !value) {
  console.log('Usage: node scripts/install/setup-keys.mjs KEY=value');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/install/setup-keys.mjs OLYMPUS_GROQ_KEY=gsk_...');
  console.log('');
  console.log('Keys are normally managed inside OpenCode: `olympus opencode` → Settings → Providers.');
  console.log('This script writes to ~/.olympus/.env as a legacy fallback.');
  process.exit(1);
}

mkdirSync(OLYMPUS_HOME, { recursive: true });
let entries = [`# OLYMPUS API keys`];
if (existsSync(DOT_ENV)) {
  entries = readFileSync(DOT_ENV, 'utf-8').split('\n').filter(l => !l.includes(`${key}=`));
}
entries.push(`${key}=${encryptValue(value)}`);
writeFileSync(DOT_ENV, entries.join('\n') + '\n', 'utf-8');
console.log(`Saved ${key} to ${DOT_ENV} (encrypted)`);
