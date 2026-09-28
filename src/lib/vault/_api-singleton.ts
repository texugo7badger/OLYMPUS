/** Olympus Vault Backend — process-wide VaultAPI singleton.
 *
 *  Lazy-initialized on first API route hit. The same instance is reused for
 *  all subsequent requests in the same Node.js process. The FsBackend opens
 *  the vault root; the VaultIndex opens the SQLite DB at
 *  `~/.olympus/vault-index.db` (override via OLYMPUS_HOME).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { createVaultAPI, type VaultAPI } from './index';

let _apiPromise: Promise<VaultAPI> | null = null;

export function getVaultApi(): Promise<VaultAPI> {
  if (!_apiPromise) {
    _apiPromise = createVaultAPI();
  }
  return _apiPromise;
}

/** Reset the singleton — used by tests. */
export function _resetVaultApiSingleton(): void {
  _apiPromise = null;
}
