/**
 * olympus-router — V2 ENTRY (the v2 protocol, 2026-10-23).
 *
 * OpenCode v2 loads a plugin DIRECTORY by its `index.js` and requires the
 * module to export `{ id, setup }` (probe-verified against 2.0.32: the
 * loader ignores package.json main and a CJS `exports.default` fails the
 * schema — the module must assign `module.exports` directly).
 *
 * The Phase 1-4 business logic lives untouched in ./v1.ts (the v1 hook
 * map); this adapter wires it to the v2 domains:
 *
 *   v1 experimental.chat.system.transform -> session.hook("context")
 *   v1 chat.params                        -> session.hook("context")
 *   v1 permission.ask                     -> permission.hook("evaluate")
 *   v1 tool.execute.before                -> tool.hook("execute.before")
 *
 * Dropped per #189 (native v2 coverage): the cache hooks (v2 caches at the
 * provider layer) and the skill-registry scan (v2 config `skills` paths).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
type AnyCtx = any;
declare const plugin: {
    id: string;
    setup(ctx: AnyCtx): Promise<void>;
};
export = plugin;
