/**
 * olympus-hooks.ts — Patch for demigod-author tool registration
 *
 * This file documents the EXACT changes needed in the original
 * .opencode/olympus/olympus-hooks.ts to register the new demigod-author
 * tool. The original file is 1092 lines — rather than ship a full copy,
 * we ship this patch + the new tool file.
 *
 * APPLY THIS PATCH with:
 *   node scripts/apply-olympus-hooks-patch.js
 *
 * OR manually:
 *   1. Add `import demigodAuthorTool from "./tools/demigod-author.js";`
 *      after the existing `import dispatchTool from "./tools/dispatch.js";`
 *      line (around line 75).
 *   2. Add `"olympus-demigod-author": demigodAuthorTool,` to the `tool:`
 *      registry (around line 986, after the `"olympus-dispatch": dispatchTool,`
 *      line).
 *   3. Add `"olympus-demigod-author": "allow",` to the `permission` block
 *      in opencode.json.
 *
 * After patching, rebuild the overlay:
 *   npm run overlay:compile
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

// This file is documentation-only — it has no runtime effect.
// See the apply-olympus-hooks-patch.js script for the actual patch logic.
export {};
