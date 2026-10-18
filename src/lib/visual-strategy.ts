/**
 * visual-strategy.ts — #148 VISUAL-STRATEGY (v0.0.5 ATELIER): the vision +
 * image modality of the OLYMPUS strategy system. Two cascades:
 *
 *   VISION (understand/describe/tag — Argos):
 *     OpenRouter :free vision (the SAME key as free-openrouter — probed
 *     live 2026-10-18: gemma-4-31b-it:free / gemma-4-26b-a4b-it:free /
 *     dots-3-note-preview:free — the dots probe returned a perfect
 *     describe while both gemmas sat rate-limited: the cascade IS the
 *     design) — NO Nemotron (the user's ban, forever).
 *
 *   GENERATION (create — Pygmalion, price-routed BYOK):
 *     Pollinations free tier first (pollen/anon), then the price ladder:
 *     SDXL-turbo ~$0.0002 (mass drafts) → FLUX schnell ~$0.0005-0.003 →
 *     Nano Banana / Imagen-4-Fast ~$0.02 (finals only). Draft-to-final
 *     cuts cost up to 72% (the catalog's measured claim).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** The vision cascade — ordered, first GREEN wins, rate-limits fall through. */
export const VISION_CASCADE: { id: string; label: string; ctx?: number }[] = [
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free vision)', ctx: 262144 },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B A4B (free vision)', ctx: 262144 },
  { id: 'dots-studio/dots-3-note-preview:free', label: 'dots-3-note (free vision)', ctx: 512000 },
  // NO Nemotron :free variants — the user's ban, forever.
];

/** The generation price ladder — free first, then BYOK price-routed. */
export const GENERATION_LADDER: {
  id: string;
  label: string;
  tier: 'free' | 'draft' | 'final';
  priceHint: string;
  provider: 'pollinations' | 'byok';
}[] = [
  { id: 'pollinations/flux', label: 'Pollinations FLUX (free pollen)', tier: 'free', priceHint: '$0', provider: 'pollinations' },
  { id: 'byok/sdxl-turbo', label: 'SDXL Turbo', tier: 'draft', priceHint: '~$0.0002/img', provider: 'byok' },
  { id: 'byok/flux-schnell', label: 'FLUX schnell', tier: 'draft', priceHint: '~$0.0005-0.003/img', provider: 'byok' },
  { id: 'byok/nano-banana', label: 'Nano Banana', tier: 'final', priceHint: '~$0.02/img', provider: 'byok' },
  { id: 'byok/imagen-4-fast', label: 'Imagen 4 Fast', tier: 'final', priceHint: '~$0.02/img', provider: 'byok' },
];

/** The Argos describe prompt — one JSON block, tags bounded, honest. */
export const ARGUS_DESCRIBE_PROMPT = `You are Argos, the all-seeing VLM demigod of OLYMPUS. Describe this image for an artist's asset vault. Reply with ONLY a compact JSON object:
{"description": "<2-3 sentences: subject, style, mood, notable details>", "tags": ["<6-10 lowercase tags: subject, style, medium, palette, mood>"], "dominant_colors": ["<#hex x2-4>"], "suggested_use": "<one line: where this asset fits (landing hero, game sprite, texture, reference, ...)>"}
No prose outside the JSON.`;

/** The user-visible strategy summary (the settings card text). */
export const VISUAL_STRATEGY_SUMMARY =
  'Vision: OpenRouter free cascade (Gemma 4 31B → 26B → dots-3-note) — the free-openrouter key, zero cost, no Nemotron. Generation: Pollinations free tier → price-routed BYOK (SDXL-turbo drafts → FLUX → Nano Banana finals).';
