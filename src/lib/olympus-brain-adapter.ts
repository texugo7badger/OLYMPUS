/**
 * Olympus brain-atlas adapter.
 *
 * Converts Olympus graph data (GraphNode / GraphLink from the Zustand
 * store) into brain-atlas graph data (BrainNode / BrainEdge / BrainGraph)
 * so the real brain-atlas WebGL2 renderer can consume it directly.
 *
 * This module also encodes the Olympus god/kind -> lobe mapping:
 *
 *   apollo     -> frontal    (master planner, architecture — SOLE frontal god)
 *   prometheus  -> temporal   (DevOps decisions — opposite hemisphere from Hermes)
 *   hephaestus   -> parietal   (backend tools)
 *   athena     -> parietal   (frontend concepts)
 *   hermes    -> temporal   (integrations)
 *   artemis   -> occipital  (security sources)
 *   persephone -> occipital  (database repos)
 *   dionysus  -> cerebellum (QA daily ops)
 *
 *   instinct  -> cerebellum
 *   knowledge -> occipital
 *   subagent  -> stem
 *
 *   (skill / project / evolved mappings still exist in the tables below
 *    for defense-in-depth, but the Brain view hard-excludes those node
 *    types as of the initial stable release — see brain-atlas-3d.tsx `nodeVisible`.)
 *
 * Preserves new scope/crossStack fields:
 *  - BrainNode now carries optional _scope, _crossStack, _stacks, _projects
 *    as underscore-prefixed internal props (the brain-atlas renderer
 *    ignores unknown fields, but our own overlay-labels.ts / future
 *    renderer extensions can read them).
 *  - The instinct color logic respects the GraphNode.color we already
 *    set in olympus.ts (which encodes scope: green=high-conf, amber=
 *    cross-stack, purple=project-bound, cyan=stack-scoped).
 *
 * Source: https://github.com/colorpulse6/brain-atlas (MIT, © Nichalas Barnes)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { assignLobePositions, KIND_TO_LOBE as BRAIN_ATLAS_KIND_TO_LOBE, LOBE_CENTERS } from '../../brain-atlas/src/shape.ts';
import { OLYMPUS_PALETTE, OLYMPUS_PALETTE_NAME, OLYMPUS_CHAOS, LOBE_TINTS } from './brain-atlas-palette.ts';
import type { BrainNode, BrainEdge, BrainGraph, LobeName, NodeKind } from '../../brain-atlas/src/types.ts';
import type { GraphNode, GraphLink } from './olympus.ts';

/* ------------------------------------------------------------------ */
/* Olympus god -> lobe mapping.                                        */
/*                                                                    */
/* Callimachus added (9th god). He lives in the brain
* stem alongside the subagents because he is the background vault
* curator (no user-facing dispatches).                                */
/* ------------------------------------------------------------------ */
export const GOD_TO_LOBE: Record<string, LobeName> = {
  apollo:      'frontal',
  atlas:       'frontal',  // Apollo's execution arm — same lobe, paired position
  hephaestus:  'parietal',
  athena:      'parietal',
  hermes:      'temporal',
  artemis:     'occipital',
  dionysus:    'cerebellum',
  persephone:  'occipital',
  prometheus:  'temporal',
  callimachus: 'stem',
};

/* ------------------------------------------------------------------ */
/* Olympus node-kind -> lobe mapping.                                  */
/* ------------------------------------------------------------------ */
export const KIND_TO_LOBE: Record<string, LobeName> = {
  god:       'frontal',
  skill:     'parietal',
  instinct:  'cerebellum',
  project:   'frontal',
  knowledge: 'occipital',
  evolved:   'temporal',
  subagent:  'stem',
};

/* ------------------------------------------------------------------ */
/* Olympus node-kind -> brain-atlas canonical NodeKind.                */
/* ------------------------------------------------------------------ */
const OLYMPUS_KIND_TO_BRAIN_KIND: Record<string, NodeKind> = {
  god:       'person',
  skill:     'tool',
  instinct:  'dailyNote',
  project:   'project',
  knowledge: 'source',
  evolved:   'workThread',
  subagent:  'index',
};

const KIND_LABEL: Record<string, string> = {
  god:       'GOD',
  skill:     'SKILL',
  instinct:  'INSTINCT',
  project:   'PROJECT',
  knowledge: 'KNOWLEDGE',
  evolved:   'EVOLVED',
  subagent:  'SUBAGENT',
};

/* ------------------------------------------------------------------ */
/* Pick the lobe for an Olympus node.                                  */
/* ------------------------------------------------------------------ */
export function lobeForNode(node: GraphNode): LobeName {
  if (node.type === 'god' && node.god) {
    return GOD_TO_LOBE[node.god] ?? 'parietal';
  }
  return KIND_TO_LOBE[node.type] ?? 'parietal';
}

/* ------------------------------------------------------------------ */
/* Convert a single Olympus GraphNode into a brain-atlas BrainNode.    */
/* ------------------------------------------------------------------ */
function toBrainNode(n: GraphNode): BrainNode {
  const lobe = lobeForNode(n);
  const kind: NodeKind = OLYMPUS_KIND_TO_BRAIN_KIND[n.type] ?? 'unknown';

  // P4 FIX — color logic. Olympus sets the scope-aware color on GraphNode
  // already. We only override for LEGACY instincts WITHOUT a scope field
  // (i.e., instincts that don't have scope tags yet). These get amber so the
  // user can distinguish them from properly-tagged instincts.
  //
  // The previous version had a dead `LOBE_TINTS.cerebellum === '#7BAE8E'`
  // constant-equality check that ALWAYS evaluated to true. Replaced with a
  // real check on `n.scope === undefined`.
  let color = n.color;
  if (n.type === 'instinct' && n.scope === undefined) {
    // Legacy instinct without scope metadata — use amber.
    color = '#C4A265';
  }

  // Build the BrainNode, preserving Olympus scope/crossStack info as
  // underscore-prefixed internal props (renderer ignores unknown fields).
  return {
    id: n.id,
    name: n.name,
    title: n.name,
    kind,
    kindLabel: KIND_LABEL[n.type] ?? n.type.toUpperCase(),
    status: 'active',
    hub: n.type === 'god',
    degree: 0,
    color,
    path: n.id,
    classificationSource: 'default',
    _lobeName: lobe,
    // Olympus scope extension (v0.0.1 Option-A optimization):
    _scope: n.scope,
    _crossStack: n.crossStack,
    _stacks: n.stacks,
    _projects: n.projects,
    _activeProject: n.activeProject,
    // P4 FIX — preserve god/confidence for the enriched tooltip + sub-clustering.
    _god: (n as any).god,
    _confidence: (n as any).confidence,
  } as BrainNode & {
    _scope?: string;
    _crossStack?: boolean;
    _stacks?: string[];
    _projects?: string[];
    _activeProject?: string;
    _god?: string;
    _confidence?: number;
  };
}

/* ------------------------------------------------------------------ */
/* Build a complete BrainGraph from Olympus graph data.                */
/* ------------------------------------------------------------------ */
export function buildOlympusBrainGraph(
  nodes: GraphNode[],
  links: GraphLink[],
): BrainGraph {
  const brainNodes: BrainNode[] = nodes.map(toBrainNode);
  const idx: Record<string, BrainNode> = Object.fromEntries(
    brainNodes.map(n => [n.id, n]),
  );

  const adj: Record<string, string[]> = {};
  for (const n of brainNodes) adj[n.id] = [];

  const edges: BrainEdge[] = [];
  for (const l of links) {
    const a = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
    const b = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
    if (!a || !b) continue;
    if (!idx[a] || !idx[b]) continue;
    edges.push({ a, b });
    adj[a]?.push(b);
    adj[b]?.push(a);
  }

  for (const n of brainNodes) {
    n.degree = adj[n.id]?.length ?? 0;
  }

  assignLobePositions(brainNodes);

  // v0.0.1 final-polish — separate same-lobe gods along different axes.
  //
  // Pairs of gods that share a lobe:
  //   parietal:  Hephaestus + Athena
  //   occipital: Artemis + Persephone
  //   temporal:  Hermes + Prometheus (mirrored lobe — opposite hemispheres)
  // Apollo is the SOLE god in the frontal lobe and is pinned to its
  // exact centroid ("centered"). The default assignLobePositions places
  // same-lobe gods at the lobe centroid + a small jitter, which causes
  // their labels to overlap. separateSameLobeGods overrides that so the
  // pairs sit on opposite sides of their lobe.
  separateSameLobeGods(brainNodes, idx);

  // P4 FIX — sub-cluster skills/instincts around their owning god within
  // each lobe. The brain-atlas assignLobePositions distributes nodes
  // uniformly, which means a skill owned by Hephaestus (parietal) might end up
  // on the far side of the lobe from Hephaestus, making ownership invisible.
  // We post-process: for every non-god node with a `_god` field, nudge its
  // _3dLobe position toward its owning god's _3dLobe position.
  subClusterByOwningGod(brainNodes, idx);

  return {
    nodes: brainNodes,
    edges,
    idx,
    adj,
    KIND_LABEL,
    activePalette: OLYMPUS_PALETTE,
    activePaletteName: OLYMPUS_PALETTE_NAME,
    CHAOS: OLYMPUS_CHAOS,
  };
}

/**
 * v0.0.1 final-polish — Separate same-lobe gods; pin sole gods to centroid.
 *
 * Pairs of gods that share a lobe:
 *   parietal:  Hephaestus + Athena   (non-mirrored)
 *   occipital: Artemis + Persephone  (non-mirrored)
 *   temporal:  Hermes + Prometheus   (MIRRORED lobe)
 *
 * Apollo is the SOLE god in the frontal lobe and is pinned to the exact
 * frontal centroid (no jitter) so he reads as "centered".
 *
 * For NON-mirrored lobes (parietal, occipital) the lobe centroid sits on
 * the brain midline (x = 0). The default assignLobePositions places both
 * gods at the centroid + a small jitter, which causes their labels to
 * overlap. We override their X to centroid ± GOD_OFFSET so they sit on
 * opposite sides of the lobe along the X axis:
 *   Hephaestus  → parietal centroid + X offset
 *   Athena      → parietal centroid − X offset
 *   Artemis     → occipital centroid + X offset
 *   Persephone  → occipital centroid − X offset
 *
 * For the MIRRORED temporal lobe (centered at x = ±0.65 — the lobe exists
 * on BOTH hemispheres), the random mirror assignment in
 * assignLobePositions could place both gods on the same hemisphere, so a
 * simple ±offset wouldn't put them on opposite sides of the brain. We
 * therefore pin them to opposite hemispheres directly:
 *   Hermes      → temporal centroid +|cx|  (right hemisphere)
 *   Prometheus  → temporal centroid −|cx|  (left hemisphere)
 * so each god anchors one side of the temporal lobe.
 *
 * Gods in single-god lobes (Apollo, Dionysus, Callimachus) are left at
 * the lobe centroid (Apollo is explicitly pinned, the others keep their
 * assignLobePositions output which is already ~centroid).
 */
function separateSameLobeGods(nodes: BrainNode[], idx: Record<string, BrainNode>): void {
  const GOD_OFFSET = 0.15;
  // Each entry: [godA, godB, lobe]. The two gods share the lobe and are
  // separated along the X axis so their labels don't overlap.
  const pairs: Array<[string, string, LobeName]> = [
    ['apollo', 'atlas', 'frontal'],    // Apollo plans, Atlas executes — side by side
    ['hephaestus', 'athena', 'parietal'],
    ['artemis', 'persephone', 'occipital'],
    ['hermes', 'prometheus', 'temporal'],
  ];
  for (const [a, b, lobe] of pairs) {
    const nodeA = idx[`god:${a}`] ?? idx[a];
    const nodeB = idx[`god:${b}`] ?? idx[b];
    if (!nodeA || !nodeB) continue;
    const posA = (nodeA as any)._3dLobe as { x: number; y: number; z: number } | undefined;
    const posB = (nodeB as any)._3dLobe as { x: number; y: number; z: number } | undefined;
    if (!posA || !posB) continue;
    const center = LOBE_CENTERS[lobe];
    if (center.mirror) {
      // Mirrored lobe (temporal): the lobe lives on BOTH hemispheres
      // (x = ±|center.c.x|). Pin one god to each hemisphere so they sit
      // on genuinely opposite SIDES of the brain, not just offset within
      // the same hemisphere. The random mirror sign from
      // assignLobePositions is overwritten here.
      const hemi = Math.abs(center.c.x);
      posA.x = hemi;   // god A → right hemisphere
      posB.x = -hemi;  // god B → left hemisphere
    } else {
      // Non-mirrored lobe: centroid sits on the midline (x = 0). Offset
      // ±GOD_OFFSET along X from the existing centroid (overwriting any
      // jitter that assignLobePositions applied). Keep Y + Z unchanged so
      // both gods stay at the lobe's vertical + depth center.
      const lobeCx = (posA.x + posB.x) * 0.5;
      posA.x = lobeCx + GOD_OFFSET;
      posB.x = lobeCx - GOD_OFFSET;
    }
  }

  // Apollo and Atlas are now handled by the pairs logic above (first pair).
  // They sit side by side in the frontal lobe, separated by ±GOD_OFFSET on X.
}

/**
 * P4 FIX — sub-cluster skills/instincts/knowledge around their owning god.
 *
 * For every non-god node with a `_god` field, move its _3dLobe position
 * 60% of the way toward its owning god's _3dLobe position. This makes
 * ownership visually obvious: skills owned by Hephaestus cluster around
 * Hephaestus within the parietal lobe, instincts owned by Dionysus cluster
 * around Dionysus within the cerebellum, etc.
 *
 * Nodes without a _god field keep their original position.
 * Gods themselves are never moved.
 */
function subClusterByOwningGod(nodes: BrainNode[], idx: Record<string, BrainNode>): void {
  for (const n of nodes) {
    const bn = n as BrainNode & { _god?: string; _3dLobe?: { x: number; y: number; z: number } };
    if (!bn._god) continue;
    if (n.hub) continue; // gods don't move
    const owner = idx[`god:${bn._god}`] ?? idx[bn._god];
    if (!owner) continue;
    const ownerPos = (owner as any)._3dLobe as { x: number; y: number; z: number } | undefined;
    const nodePos = bn._3dLobe;
    if (!ownerPos || !nodePos) continue;
    // Move 50% toward the owning god. Keeps the node in the same lobe
    // (since both are in the same lobe per lobeForNode) but pulls it close.
    nodePos.x = nodePos.x + (ownerPos.x - nodePos.x) * 0.5;
    nodePos.y = nodePos.y + (ownerPos.y - nodePos.y) * 0.5;
    nodePos.z = nodePos.z + (ownerPos.z - nodePos.z) * 0.5;
  }
}

/* ------------------------------------------------------------------ */
/* Empty graph — returned when the store has no graphData yet.         */
/* ------------------------------------------------------------------ */
export function emptyOlympusBrainGraph(): BrainGraph {
  return {
    nodes: [],
    edges: [],
    idx: {},
    adj: {},
    KIND_LABEL,
    activePalette: OLYMPUS_PALETTE,
    activePaletteName: OLYMPUS_PALETTE_NAME,
    CHAOS: OLYMPUS_CHAOS,
  };
}

/* Re-export the brain-atlas KIND_TO_LOBE for callers that need it. */
export { BRAIN_ATLAS_KIND_TO_LOBE };

/* Re-export LOBE_CENTERS so the legend / lobe toggle UI can read the */
/* canonical lobe labels + radii without reaching into brain-atlas.   */
export { LOBE_CENTERS } from '../../brain-atlas/src/shape.ts';
export { LOBES, allLobesEnabled, setLobeEnabled, setAllLobes, type LobeVisibility } from '../../brain-atlas/src/lobe-visibility.ts';
export type { LobeName } from '../../brain-atlas/src/types.ts';
