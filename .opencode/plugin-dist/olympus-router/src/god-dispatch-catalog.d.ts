/**
 * GOD_DISPATCH_CATALOG
 *
 * The canonical catalog of which demigods belong to which god. This is the
 * single source of truth for the dispatch graph — used by:
 *   - Apollo's prompt (the "Specialist Gods" table)
 *   - The olympus-router plugin (for scope enforcement)
 *   - The dispatch-tracker (for god -> demigod attribution)
 *   - apply-strategy.js (for demigod model inheritance)
 *
 * The dispatch catalog is organized by god, with each
 * god owning 6-9 demigods. The old olympus- / ecc- prefixes are
 * GONE — demigods are now unprefixed (the parent god is encoded by the
 * directory: demigods/<god>/<name>.txt).
 *
 * This file is imported by olympus-router/index.ts (replacing the implicit
 * dispatch knowledge). It is ALSO imported by apply-strategy.js (via a
 * JSON export) so the strategy applier can validate the demigod roster.
 *
 * Quality constraints (see CHANGES.md):
 *   - All `.on('error', (err) => ...)` use `(err: any)` (n/a — no listeners).
 *   - All `child.stdout`/`child.stderr` use `?.` (n/a — no child_process).
 *   - Never uses `import.meta.url` (this is a `.opencode/` plugin file).
 *   - Cross-platform — Windows, macOS, Linux.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export declare const GOD_DISPATCH_CATALOG: Record<string, string[]>;
/**
 * Reverse lookup: demigod -> parent god.
 * Used by apply-strategy.js to determine which god's model a demigod inherits.
 */
export declare const DEMIGOD_TO_GOD: Record<string, string>;
/**
 * Get the parent god for a demigod. Returns null if the demigod is not in
 * the catalog (which means it's either a god itself, or an unknown agent).
 */
export declare function getParentGod(demigodName: string): string | null;
/**
 * Get the demigods for a god. Returns an empty array if the god is not in
 * the catalog.
 */
export declare function getDemigodsForGod(godName: string): string[];
/**
 * Is the given agent ID a god?
 */
export declare function isGod(agentId: string): boolean;
/**
 * Is the given agent ID a demigod?
 */
export declare function isDemigod(agentId: string): boolean;
/**
 * Total demigod count (for verification — should be 77).
 */
export declare const TOTAL_DEMIGODS: number;
