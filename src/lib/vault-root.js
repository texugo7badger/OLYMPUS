/**
 * Vault Root — single source of truth for the vault directory.
 *
 * JS TWIN of src/lib/vault-root.ts — KEEP IN SYNC. This mirror exists because
 * the symphony's committed .js chain (and the Turbopack app build, which
 * resolves '.js' specifiers literally instead of mapping them to '.ts') needs
 * a real JavaScript file here. TypeScript never type-checks this twin: both
 * NodeNext (overlay) and bundler (root) resolution strip the '.js' extension
 * and prefer the '.ts' sibling. Only RUNTIME code paths bundle this file.
 *
 * Resolution order: OLYMPUS_VAULT_DIR env var → ~/.olympus/vault-root.txt
 * → ~/OLYMPUS-VAULT/ (default). All vault path consumers should import
 * getVaultRoot() from here.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT_FILE = join(homedir(), '.olympus', 'vault-root.txt');
const DEFAULT_VAULT_ROOT = join(homedir(), 'OLYMPUS-VAULT');

let cachedRoot = null;

/**
 * Returns the active vault root directory. Cached after the first call —
 * if the user switches vaults via Settings, they must restart OLYMPUS for
 * the change to take effect (documented limitation).
 */
export function getVaultRoot() {
  if (cachedRoot !== null) return cachedRoot;

  // 1. Env var (highest priority — set by `olympus --vault <path>`).
  if (process.env.OLYMPUS_VAULT_DIR) {
    cachedRoot = process.env.OLYMPUS_VAULT_DIR;
    return cachedRoot;
  }

  // 2. ~/.olympus/vault-root.txt (written by Settings → Switch Vault).
  try {
    if (existsSync(VAULT_ROOT_FILE)) {
      const custom = readFileSync(VAULT_ROOT_FILE, 'utf-8').trim();
      if (custom) {
        cachedRoot = custom;
        return cachedRoot;
      }
    }
  } catch {}

  // 3. Default.
  cachedRoot = DEFAULT_VAULT_ROOT;
  return cachedRoot;
}

/**
 * Switch the active vault root. Writes the path to ~/.olympus/vault-root.txt.
 * The user must restart OLYMPUS for the change to take effect (the OpenCode
 * overlay plugin reads the vault path at startup).
 */
export function setVaultRoot(vaultPath) {
  mkdirSync(dirname(VAULT_ROOT_FILE), { recursive: true });
  writeFileSync(VAULT_ROOT_FILE, vaultPath, 'utf-8');
}

/**
 * Reset to the default vault root (~/OLYMPUS-VAULT/). Deletes the
 * vault-root.txt file so getVaultRoot() falls back to the default.
 */
export function resetVaultRoot() {
  try {
    if (existsSync(VAULT_ROOT_FILE)) {
      // NOTE: vault-root.ts calls require('node:fs') inline here (the Next
      // bundler shims it). This twin imports unlinkSync statically instead so
      // it also works under pure Node ESM, where require is undefined.
      unlinkSync(VAULT_ROOT_FILE);
    }
  } catch {}
}

/**
 * Get the default vault root (~/OLYMPUS-VAULT/). Used by the Settings UI
 * to show "Reset to default" + by the installer.
 */
export function getDefaultVaultRoot() {
  return DEFAULT_VAULT_ROOT;
}

/**
 * Check if the current vault root is the default or a custom path.
 */
export function isCustomVaultRoot() {
  return getVaultRoot() !== DEFAULT_VAULT_ROOT;
}

/**
 * Get the path to a specific file within the vault. Convenience wrapper.
 */
export function vaultPath(...segments) {
  return join(getVaultRoot(), ...segments);
}