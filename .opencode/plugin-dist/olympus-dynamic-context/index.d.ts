/**
 * olympus-dynamic-context — V2 ENTRY (the v2 protocol, 2026-10-23).
 *
 * The token-budget preamble builder lives untouched in ./v1.ts; this
 * adapter feeds it the v2 session context. The v1 hook rewrote
 * `output.system` (string[]); v2 carries `SystemPart[]`, so the adapter
 * diffs the last part and appends only the delta — cache hints and
 * metadata on the part survive.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
type AnyCtx = any;
declare const plugin: {
    id: string;
    setup(ctx: AnyCtx): Promise<void>;
};
export = plugin;
