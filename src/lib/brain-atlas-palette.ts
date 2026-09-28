/**
 * Olympus palette entry for the brain-atlas renderer.
 *
 * This module registers a new `OLYMPUS` palette into the brain-atlas
 * palette system (brain-atlas/src/palette.ts). The brain-atlas ships 7
 * palettes (GRAPHITE, INK, MAGMA, BIO, ACID, AURORA, DAYLIGHT); we add
 * an 8th — OLYMPUS — built from the pastel colors defined in the
 * Olympus v0.0.1 overhaul (Issue 11):
 *
 *   Gods       #D4A574  soft gold
 *   Skills     #6B8FB5  soft blue
 *   Instincts  #7BAE8E  soft green   (conf >= 0.7)
 *   Instincts  #C4A265  soft amber   (conf <  0.7)
 *   Projects   #9B7BAE  soft purple
 *   Knowledge  #6BAEB5  soft cyan
 *   Evolved    #6BAEB5  soft cyan
 *   Errors     #C4756A  soft red
 *
 * Background + foreground use the Olympus dark workspace tones
 * (#0A0E16 / #050810) so the brain sits inside the same panel chrome
 * as the rest of the UI.
 *
 * Source: https://github.com/colorpulse6/brain-atlas (MIT, © Nichalas Barnes)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { PALETTES, CHAOS as BRAIN_ATLAS_CHAOS } from '../../brain-atlas/src/palette.ts';
import type { BrainPalette, BrainChaos } from '../../brain-atlas/src/types.ts';

/* ------------------------------------------------------------------ */
/* The Olympus palette — single source of truth for the brain atlas.  */
/*                                                                    */
/* P4 FIX — color collisions fixed:                                   */
/*  - knowledge (source) changed from #6BAEB5 (cyan) to #9B7BAE        */
/*    (soft purple) so it no longer collides with evolved (workThread).*/
/*  - evolved (workThread) stays at #C4956A (muted amber).             */
/*  - instinct (dailyNote) stays at #7BAE8E (soft green).              */
/*  - skill (tool/concept) stays at #6B8FB5 (soft blue).               */
/*  - god (person/decision/organization) stays at #D4A574 (soft gold). */
/*  - project stays at #9B7BAE... wait, that now collides with         */
/*    knowledge. Use a BRIGHTER gold (#E5B574) for projects so they    */
/*    stand out as the active project hub.                             */
/* ------------------------------------------------------------------ */
export const OLYMPUS_PALETTE: BrainPalette = {
  label: 'OLYMPUS',
  bg: '#0A0E16',       // matches workspace background (Issue 11)
  bgFar: '#050810',    // subtle vignette
  fg: '#B8B8B8',       // primary text (softer white)
  hud: '#D4A574',      // HUD accents use soft gold
  chroma: 0.85,
  kinds: {
    // brain-atlas canonical kinds (the renderer reads these keys):
    person:       '#D4A574',   // maps to Olympus gods (orchestrators are "people")
    project:      '#E5B574',   // P4: bright gold — projects stand out as the active hub
    concept:      '#6B8FB5',   // soft blue  (skills live in parietal as concepts/tools)
    decision:     '#D4A574',   // soft gold  (decisions = frontal, god-tier)
    question:     '#C4A265',   // soft amber
    tool:         '#6B8FB5',   // soft blue  (skills = tools)
    workThread:   '#C4956A',   // muted amber (evolved / hermes)
    dailyNote:    '#7BAE8E',   // soft green (instincts = daily ops)
    source:       '#9B7BAE',   // P4: soft purple (knowledge — was cyan, collided with evolved)
    repo:         '#9B7BAE',   // soft purple (persephone databases)
    incident:     '#C4756A',   // soft red   (errors / contradictions)
    organization: '#D4A574',   // soft gold
    index:        '#8B8B8B',   // soft gray  (subagents / routing)
    unknown:      '#8B8B8B',   // soft gray
  },
};

/* ------------------------------------------------------------------ */
/* Register OLYMPUS into the brain-atlas PALETTES map so any code    */
/* that looks up palettes by name (including the brain-atlas own      */
/* settings normalizer) finds it.                                     */
/* ------------------------------------------------------------------ */
(PALETTES as Record<string, BrainPalette>).olympus = OLYMPUS_PALETTE;

/* The palette name we want active by default in Olympus. */
export const OLYMPUS_PALETTE_NAME = 'olympus';

/* ------------------------------------------------------------------ */
/* Lobe tint colors — used for the brain cloud haze + lobe labels.    */
/* Each lobe gets a soft tint derived from the kinds that live in it. */
/* These mirror the brain-atlas LOBE_KIND map (frontal->project,      */
/* parietal->concept, temporal->person, occipital->source,            */
/* cerebellum->dailyNote, stem->index) so the haze matches the lobe's */
/* "primary" kind color.                                              */
/* ------------------------------------------------------------------ */
export const LOBE_TINTS: Record<string, string> = {
  frontal:    '#D4A574',   // apollo + projects — soft gold
  parietal:   '#6B8FB5',   // skills + concepts — soft blue
  temporal:   '#C4956A',   // evolved + hermes + prometheus — muted amber
  occipital:  '#9B7BAE',   // P4: knowledge + artemis/persephone — soft purple (was cyan, collided)
  cerebellum: '#7BAE8E',   // instincts + dionysus — soft green
  stem:       '#8B8B8B',   // subagents — soft gray
};

/* ------------------------------------------------------------------ */
/* Chaos parameters — control the "alive" feel of the brain.          */
/* Tuned slightly calmer than the brain-atlas default for long        */
/* coding sessions.                                                    */
/* ------------------------------------------------------------------ */
export const OLYMPUS_CHAOS: BrainChaos = {
  wobbleAmp: 0.012,    // brain-atlas default 0.018 — calmer for Olympus
  wobbleSpeed: 0.5,    // brain-atlas default 0.6 — slightly slower
  halo: 0.55,          // node halo intensity
  bloom: 0.4,          // edge bloom intensity
  blob: 0,             // 0 = no blob deformation
  // v0.0.1 final-polish — bumped from 1.8 to 2.5 to spread out crowded
  // nodes. Combined with the new minimum inter-node distance constraint in
  // olympus-brain-adapter.ts (which offsets same-lobe gods along different
  // axes) and the default god-only filter, the brain is now readable on
  // first view. When the user enables skills/instincts/knowledge via the
  // filter sidebar, the higher jitter keeps them from overlapping.
  jitter: 2.5,         // cloud point jitter (was 0.8 → 1.1 → 1.8 → 2.5)
};

/* Re-export the brain-atlas default CHAOS for callers that want it. */
export { BRAIN_ATLAS_CHAOS };

/* ------------------------------------------------------------------ */
/* Color helpers — thin wrappers around the brain-atlas gl/color.ts   */
/* hexToRgb01 so Olympus code doesn't reach across module boundaries  */
/* for trivial color math.                                            */
/* ------------------------------------------------------------------ */
export { hexToRgb01 } from '../../brain-atlas/src/gl/color.ts';

/** Apply alpha to a hex color, returning an rgba() string. */
export function hexA(hex: string, alpha: number): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mix two hex colors by t (0..1). Used for edge gradients. */
export function mixHex(a: string, b: string, t: number): string {
  const ha = a.startsWith('#') ? a.slice(1) : a;
  const hb = b.startsWith('#') ? b.slice(1) : b;
  const ar = parseInt(ha.slice(0, 2), 16);
  const ag = parseInt(ha.slice(2, 4), 16);
  const ab = parseInt(ha.slice(4, 6), 16);
  const br = parseInt(hb.slice(0, 2), 16);
  const bg = parseInt(hb.slice(2, 4), 16);
  const bb = parseInt(hb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}
