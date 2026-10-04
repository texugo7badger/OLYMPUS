/**
 * Shipped type declarations for src/lib/vault-root.js (the compiled
 * artifact next to this file). Hand-seeded once at MADRUGA-3 p2 to break
 * the emit cycle (the overlay compile needs these types to resolve the
 * `.js` import specifier); the overlay postcompile SYNC refreshes this
 * file from its own emission on every overlay:compile from now on.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export declare function getVaultRoot(): string;
export declare function setVaultRoot(vaultPath: string): void;
export declare function resetVaultRoot(): void;
export declare function getDefaultVaultRoot(): string;
export declare function isCustomVaultRoot(): boolean;
export declare function vaultPath(...segments: string[]): string;
