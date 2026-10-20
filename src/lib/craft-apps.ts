/**
 * craft-apps.ts — W-G CRAFT-EMBED (v0.0.7): the ArtCraft Crafting Apps lane
 * — thirteen open-source creative apps (Apache-2.0, github.com/storytold/*)
 * embedded INSIDE OLYMPUS for both the user and the agents.
 *
 * The doctrine (the user's directive, 2026-10-20): everything inside
 * OLYMPUS. The Craft Apps ship web builds at app.getartcraft.com/<app> —
 * the panel embeds them live; the manifest here is the CATALOG (what
 * exists), the LIVE PROBE is the truth (what runs + what allows embedding
 * right now). Nothing stale: scripts/refresh-craft-apps.js re-verifies on
 * demand + the panel route probes per request. The vendored-WASM offline
 * lane is documented and deferred (docs/research/craft-apps.md — the size
 * + toolchain honesty).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface CraftApp {
  /** The kebab id (the URL slug). */
  id: string;
  name: string;
  category: string;
  /** The upstream's own honest maturity label. */
  status: string;
  url: string;
  repo: string;
  license: string;
}

/** The 13 Crafting Apps (statuses from getartcraft.com/apps, 2026-10-20). */
export const CRAFT_APPS: CraftApp[] = [
  { id: 'photocraft', name: 'PhotoCraft', category: 'Image editor', status: 'Early alpha', url: 'https://app.getartcraft.com/photocraft', repo: 'storytold/photocraft', license: 'Apache-2.0' },
  { id: 'vectorcraft', name: 'VectorCraft', category: 'Vector illustration', status: 'In development', url: 'https://app.getartcraft.com/vectorcraft', repo: 'storytold/vectorcraft', license: 'Apache-2.0' },
  { id: 'filmcraft', name: 'FilmCraft', category: 'Video editor', status: 'In development', url: 'https://app.getartcraft.com/filmcraft', repo: 'storytold/filmcraft', license: 'Apache-2.0' },
  { id: 'lightcraft', name: 'LightCraft', category: 'Photo library & raw', status: 'In development', url: 'https://app.getartcraft.com/lightcraft', repo: 'storytold/lightcraft', license: 'Apache-2.0' },
  { id: 'pdfcraft', name: 'PdfCraft', category: 'PDF workbench', status: 'Early alpha', url: 'https://app.getartcraft.com/pdfcraft', repo: 'storytold/pdfcraft', license: 'Apache-2.0' },
  { id: 'effectcraft', name: 'EffectCraft', category: 'Motion graphics & VFX', status: 'In development', url: 'https://app.getartcraft.com/effectcraft', repo: 'storytold/effectcraft', license: 'Apache-2.0' },
  { id: 'designcraft', name: 'DesignCraft', category: 'Page layout & publishing', status: 'In development', url: 'https://app.getartcraft.com/designcraft', repo: 'storytold/designcraft', license: 'Apache-2.0' },
  { id: 'figcraft', name: 'FigCraft', category: 'Interface design', status: 'Early alpha', url: 'https://app.getartcraft.com/figcraft', repo: 'storytold/figcraft', license: 'Apache-2.0' },
  { id: 'wordcraft', name: 'WordCraft', category: 'Word processing', status: 'In development', url: 'https://app.getartcraft.com/wordcraft', repo: 'storytold/wordcraft', license: 'Apache-2.0' },
  { id: 'soundcraft', name: 'SoundCraft', category: 'Audio workstation', status: 'In development', url: 'https://app.getartcraft.com/soundcraft', repo: 'storytold/soundcraft', license: 'Apache-2.0' },
  { id: 'deckcraft', name: 'DeckCraft', category: 'Presentations', status: 'In development', url: 'https://app.getartcraft.com/deckcraft', repo: 'storytold/deckcraft', license: 'Apache-2.0' },
  { id: 'cadcraft', name: 'CADCraft', category: 'CAD & drafting', status: 'In development', url: 'https://app.getartcraft.com/cadcraft', repo: 'storytold/cadcraft', license: 'Apache-2.0' },
  { id: 'gridcraft', name: 'GridCraft', category: 'Spreadsheets & data', status: 'In development', url: 'https://app.getartcraft.com/gridcraft', repo: 'storytold/gridcraft', license: 'Apache-2.0' },
];

/** The ArtCraft STUDIO itself (the AI crafting engine — the artcraft
 *  button's target; also embedded, never a browser-tab escape). */
export const ARTCRAFT_STUDIO = {
  id: 'artcraft-studio',
  name: 'ArtCraft Studio',
  category: 'AI image & video crafting',
  status: 'Live',
  url: 'https://app.getartcraft.com/create-image',
  urlVideo: 'https://app.getartcraft.com/create-video',
  repo: 'storytold/artcraft',
  license: 'MIT / Apache-2.0 (dual)',
} as const;

export interface CraftAppProbe {
  id: string;
  url: string;
  /** The URL answered. */
  ok: boolean;
  /** The embed verdict: false when the upstream sends X-Frame-Options /
   *  CSP frame-ancestors that block iframing — the honest external-open
   *  fallback fires, never a blank frame. */
  frameable: boolean;
  httpStatus: number | null;
  note?: string;
}

/** Probe one URL for reachability + iframe embedability (the honest
 *  gate: a frame-blocking header means the panel offers the external open
 *  instead of rendering a dead frame). */
export async function probeCraftApp(url: string, timeoutMs = 8000): Promise<CraftAppProbe> {
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase();
    const frameBlocked =
      xfo.includes('deny') || xfo.includes('sameorigin') ||
      (csp.includes('frame-ancestors') && !csp.includes("frame-ancestors *"));
    return {
      id: url.split('/').pop() || url,
      url,
      ok: r.ok,
      frameable: r.ok && !frameBlocked,
      httpStatus: r.status,
      note: frameBlocked ? 'the upstream blocks embedding — open externally' : undefined,
    };
  } catch (e: any) {
    return { id: url.split('/').pop() || url, url, ok: false, frameable: false, httpStatus: null, note: e?.message || 'unreachable' };
  }
}

/** Probe the full catalog (parallel, bounded) — the live truth layer. */
export async function probeAllCraftApps(): Promise<CraftAppProbe[]> {
  const urls = [ARTCRAFT_STUDIO.url, ...CRAFT_APPS.map((a) => a.url)];
  return Promise.all(urls.map((u) => probeCraftApp(u)));
}
