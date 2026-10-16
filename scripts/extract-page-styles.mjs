#!/usr/bin/env node
/**
 * extract-page-styles.mjs — DESIGN-INTELLIGENCE: the CDP-adjacent style
 * extractor. Fetches the served page + the CSS, extracts the REAL visual
 * data (fonts, colors, spacing, dark-theme layers) and outputs a
 * structured JSON the design-review god can critique WITHOUT needing
 * vision. Zero dependencies — just HTTP + text parsing.
 *
 * Usage: node scripts/extract-page-styles.mjs <url> <project-root>
 * Output: JSON to stdout (the style report for the design review).
 */
const url = process.argv[2] || 'http://127.0.0.1:3000';
const projectRoot = process.argv[3] || process.cwd();

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const report = { url, extractedAt: new Date().toISOString(), checks: {} };

  // 1. Fetch the rendered HTML
  let html = '';
  try {
    const res = await fetch(url);
    html = await res.text();
    report.httpStatus = res.status;
  } catch (e) {
    report.httpStatus = 0;
    report.fetchError = e.message;
  }

  // 2. Extract the CSS custom properties (the design tokens)
  const cssPaths = [
    join(projectRoot, 'app/globals.css'),
    join(projectRoot, 'src/app/globals.css'),
    join(projectRoot, 'styles/globals.css'),
  ];
  let css = '';
  for (const p of cssPaths) {
    if (existsSync(p)) { css = readFileSync(p, 'utf-8'); break; }
  }
  if (!css) {
    // Try to extract inline <style> from the HTML
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (styleMatch) css = styleMatch[1];
  }

  // 3. Extract design tokens from the CSS
  const tokens = {};
  const tokenRe = /--([\w-]+)\s*:\s*([^;]+)/g;
  let m;
  while ((m = tokenRe.exec(css))) tokens[m[1]] = m[2].trim();
  report.tokens = tokens;

  // 4. Extract font-family usage
  const fonts = new Set();
  const fontRe = /font-family\s*:\s*([^;}]+)/g;
  while ((m = fontRe.exec(css))) fonts.add(m[1].trim());
  // Also check the HTML for inline font references
  while ((m = fontRe.exec(html))) fonts.add(m[1].trim());
  report.fontsUsed = [...fonts];

  // 5. Check for the "AI slop" patterns
  const slopChecks = {
    usesInterOrSystemUi: /\b(Inter|system-ui|-apple-system|Segoe UI)\b/i.test(css) || /\b(Inter|system-ui)\b/i.test(html),
    usesGenericZinc: /zinc-[89]\d{2}/.test(css) && !/--color-/.test(css),
    hasNoCustomProps: Object.keys(tokens).length < 3,
    flatDarkTheme: /zinc-900/.test(css) && !/--color-(surface|elevated|card)/.test(css),
    hasFontImport: /@import|next\/font|google.*fonts/i.test(css) || /next\/font/i.test(html),
  };
  report.slopSignals = slopChecks;
  report.slopCount = Object.values(slopChecks).filter(Boolean).length;

  // 6. Extract accent color usage
  const accentPatterns = /(?:accent|primary|brand|indigo|purple|violet|blue)-?\d{0,3}/g;
  const accentMatches = (css.match(accentPatterns) || []).slice(0, 10);
  report.accentClasses = accentMatches;

  // 7. Extract spacing patterns (generosity check)
  const spacingRe = /(?:py|px|p|gap|mt|mb|ml|mr)-(?:\d+)/g;
  const spacingValues = (css.match(spacingRe) || []);
  const hasGenerousSpacing = spacingValues.some(v => /-(?:1[6-9]|20|24|32)/.test(v));
  report.spacingGenerous = hasGenerousSpacing;
  report.spacingClasses = spacingValues.slice(0, 20);

  // 8. Check component quality signals from the HTML
  const componentSignals = {
    hasCustomBorder: /border-\[|border-[a-z]+-\[|outline-\[|ring-\[/.test(css),
    hasGradient: /gradient|from-|to-/.test(css),
    hasHoverEffects: /hover:/.test(css),
    hasTransitions: /transition|duration-|animate-/.test(css),
    hasShadowLayers: /shadow-(?:sm|md|lg|xl|2xl)/.test(css),
    hasScaleEffects: /scale-\[|transform/.test(css),
  };
  report.componentQuality = componentSignals;
  report.qualityScore = Object.values(componentSignals).filter(Boolean).length;

  // 9. Extract the HTML structure (headings hierarchy)
  const headings = [...html.matchAll(/<h([1-6])[^>]*>([^<]*)<\/h\1>/g)].map(h => ({ level: h[1], text: h[2].trim() }));
  report.headingHierarchy = headings.slice(0, 15);

  // 10. Meta tags (viewport, description, etc.)
  const metaTags = [...html.matchAll(/<meta[^>]*name="([^"]*)"[^>]*content="([^"]*)"/g)]
    .map(m => ({ name: m[1], content: m[2].slice(0, 100) }));
  report.metaTags = metaTags;

  // Output
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
