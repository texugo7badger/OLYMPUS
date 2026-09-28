/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY OVERLAY EXTENSION — Tool Registration Only
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This module is a sibling extension to olympus-hooks.ts. It registers
 *  the three Symphony tools with OpenCode's plugin system:
 *
 *    - symphony-resonate    : a God composes a VibrationalSignature
 *    - symphony-harmonize   : a Demigod returns a HarmonicPattern
 *    - symphony-decode      : the Decoding Choir translates for the user
 *
 *  The Symphony overlay is intentionally NON-DESTRUCTIVE — it does not
 *  replace or override any existing OLYMPUS hook. It only ADDS three new
 *  tools to the registry. A God may use these tools OR continue using
 *  the existing olympus-dispatch + caveman infrastructure. The two
 *  layers coexist.
 *
 *  Registration: in opencode.json, add this module's tools to the
 *  olympus overlay's `tools` array (or import from here directly in
 *  olympus-hooks.ts).
 *
 *  Build: this file is compiled alongside olympus-hooks.ts by the
 *         existing TypeScript build step (.opencode/olympus/tsconfig.json).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import symphonyResonateTool from './tools/symphony-resonate.js';
import symphonyHarmonizeTool from './tools/symphony-harmonize.js';
import symphonyDecodeTool from './tools/symphony-decode.js';
import type { ToolDefinition } from '@opencode-ai/plugin/tool';

/**
 * The Symphony tool registry. Import this array from olympus-hooks.ts
 * and spread it into the plugin's `tools` array.
 *
 *  Example (in olympus-hooks.ts):
 *
 *    import { SYMPHONY_TOOLS } from './symphony/symphony-hooks.js';
 *    // ...
 *    tools: [
 *      // ...existing OLYMPUS tools...
 *      ...SYMPHONY_TOOLS,
 *    ],
 */
export const SYMPHONY_TOOLS: ToolDefinition[] = [
  symphonyResonateTool,
  symphonyHarmonizeTool,
  symphonyDecodeTool,
];

/**
 * A human-readable manifest of the Symphony overlay, for inclusion in
 * the OLYMPUS startup banner or the doctor health-check.
 */
export const SYMPHONY_MANIFEST: {
  name: string;
  version: string;
  protocol: string;
  vaultBrainCompat: string;
  tools: string[];
  references: string[];
  targetBand: { low: number; high: number };
} = {
  name: 'symphony',
  version: '1.0.0',
  protocol: 'symphony/1.0',
  vaultBrainCompat: '3.0',
  tools: [
    'symphony-resonate',
    'symphony-harmonize',
    'symphony-decode',
  ],
  references: [
    'InterLat — Latent Space Communication',
    'Slipstream v3 / ACCP — Semantic Quantization',
    'RecursiveMAS / G²CP — Parallel Orchestration',
    'KV-Cache Sharing / Cross-Attention',
    'Cost of Coordination — Beyond Tokens',
  ],
  targetBand: { low: 0.70, high: 0.90 },
};

export default SYMPHONY_MANIFEST;
