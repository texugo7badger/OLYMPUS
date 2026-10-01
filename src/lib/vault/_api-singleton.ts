/** Olympus Vault Backend — process-wide VaultAPI singleton.
 *
 *  Lazy-initialized on first API route hit. The same instance is reused for
 *  all subsequent requests in the same Node.js process. The FsBackend opens
 *  the vault root; the VaultIndex opens the SQLite DB at
 *  `~/.olympus/vault-index.db` (override via OLYMPUS_HOME).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { createVaultAPI, type VaultAPI } from './index';
import { getVaultRoot } from '@/lib/vault-root';

let _apiPromise: Promise<VaultAPI> | null = null;

export function getVaultApi(): Promise<VaultAPI> {
  if (!_apiPromise) {
    // Canonical root (issue #27). Without this, FsBackend falls back to its
    // own `OLYMPUS_VAULT || ~/OLYMPUS-VAULT` precedence, which ignores
    // OLYMPUS_VAULT_DIR and ~/.olympus/vault-root.txt — so every /api/vault/*
    // route silently read the wrong tree whenever the vault was non-default.
    // getVaultRoot() is stable for the process lifetime (cached in
    // lib/vault-root.ts; switching vaults requires a restart), so capturing
    // it once here stays consistent with the singleton's own caching.
    _apiPromise = createVaultAPI({ fs: { vaultRoot: getVaultRoot() } });
  }
  return _apiPromise;
}

/** Reset the singleton — used by tests. */
export function _resetVaultApiSingleton(): void {
  _apiPromise = null;
}
