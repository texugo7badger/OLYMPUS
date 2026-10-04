/**
 * Vault Root — single source of truth for the vault directory.
 *
 * MADRUGA-3 p2 (D21): ONE canonical resolver, ONE canonical env var.
 * Resolution order: OLYMPUS_VAULT (canonical) → OLYMPUS_VAULT_DIR
 * (DEPRECATED — loud warning when consumed) → ~/.olympus/vault-root.txt
 * → ~/OLYMPUS-VAULT/ (default). All vault path consumers should import
 * getVaultRoot() from here — never read the env vars directly.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
const VAULT_ROOT_FILE = join(homedir(), '.olympus', 'vault-root.txt');
const DEFAULT_VAULT_ROOT = join(homedir(), 'OLYMPUS-VAULT');
// The D21 deprecation warning fires once per process, loudly — never silent.
let warnedDeprecatedVaultDir = false;
let cachedRoot = null;
/**
 * Returns the active vault root directory. Cached after the first call —
 * if the user switches vaults via Settings, they must restart OLYMPUS for
 * the change to take effect (documented limitation).
 */
export function getVaultRoot() {
    if (cachedRoot !== null)
        return cachedRoot;
    // 1. Canonical env var (OLYMPUS-spawned processes, fixtures, lanes).
    if (process.env.OLYMPUS_VAULT) {
        cachedRoot = process.env.OLYMPUS_VAULT;
        return cachedRoot;
    }
    // 2. DEPRECATED: OLYMPUS_VAULT_DIR (the pre-D21 name — its readers were
    //    migrated to this resolver; `olympus --vault` still sets it, so it
    //    stays honored, but every consume warns loudly until retired).
    if (process.env.OLYMPUS_VAULT_DIR) {
        if (!warnedDeprecatedVaultDir) {
            warnedDeprecatedVaultDir = true;
            console.error(`[vault-root] DEPRECATION: OLYMPUS_VAULT_DIR is set — the canonical ` +
                `variable is OLYMPUS_VAULT (D21, MADRUGA-3 p2). Migrate the caller; ` +
                `this alias will be removed.`);
        }
        cachedRoot = process.env.OLYMPUS_VAULT_DIR;
        return cachedRoot;
    }
    // 3. ~/.olympus/vault-root.txt (written by Settings → Switch Vault).
    try {
        if (existsSync(VAULT_ROOT_FILE)) {
            const custom = readFileSync(VAULT_ROOT_FILE, 'utf-8').trim();
            if (custom) {
                cachedRoot = custom;
                return cachedRoot;
            }
        }
    }
    catch { }
    // 4. Default.
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
            const { unlinkSync } = require('node:fs');
            unlinkSync(VAULT_ROOT_FILE);
        }
    }
    catch { }
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
//# sourceMappingURL=vault-root.js.map