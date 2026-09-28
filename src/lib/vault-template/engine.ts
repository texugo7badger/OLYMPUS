/**
 * Olympus Vault Template — Handlebars Engine
 * ============================================
 *
 * Wraps `handlebars` with Olympus-specific helpers and macros. Templater's
 * `<% tp.* %>` syntax is NOT supported (we chose Handlebars for security —
 * no JS eval sandbox needed).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import Handlebars from 'handlebars';
import { registerDateHelpers } from './helpers/date';
import { registerTimeHelpers } from './helpers/time';
import { registerFileHelpers } from './helpers/file';
import { registerGodHelpers } from './helpers/god';
import { registerEnvelopeHelpers } from './helpers/envelope';
import { registerFrontmatterHelpers } from './helpers/frontmatter';
import { registerOlympusHelpers } from './helpers/olympus';
import { MACROS } from './macros';
import type { Macro, MacroContext, TemplateApplyResult } from '../vault/types';
import type { VaultBackend } from '../vault/backend';

let _instance: typeof Handlebars | null = null;

/**
 * Get a configured Handlebars instance with all Olympus helpers registered.
 * Singleton — registers helpers only once.
 */
export function getHandlebars(): typeof Handlebars {
  if (_instance) return _instance;
  const hbs = Handlebars.create();
  registerDateHelpers(hbs);
  registerTimeHelpers(hbs);
  registerFileHelpers(hbs);
  registerGodHelpers(hbs);
  registerEnvelopeHelpers(hbs);
  registerFrontmatterHelpers(hbs);
  registerOlympusHelpers(hbs);
  _instance = hbs;
  return hbs;
}

/**
 * Render a template string with a context.
 */
export function renderTemplate(template: string, ctx: MacroContext): string {
  const hbs = getHandlebars();
  const compiled = hbs.compile(template, { noEscape: true, strict: false });
  return compiled(ctx);
}

/**
 * List all registered macros.
 */
export function listMacros(): Macro[] {
  return MACROS;
}

/**
 * Apply a macro: read its template, render with `ctx`, write to the output
 * path, return the result. Throws if the macro doesn't exist or required
 * vars are missing.
 */
export async function applyMacro(
  backend: VaultBackend,
  macroName: string,
  ctx: MacroContext,
): Promise<TemplateApplyResult> {
  const macro = MACROS.find((m) => m.name === macroName);
  if (!macro) {
    throw new Error(`Unknown macro: ${macroName}. Available: ${MACROS.map((m) => m.name).join(', ')}`);
  }
  // Validate required vars
  const missing = macro.requiredVars.filter((v) => ctx.vars[v] === undefined || ctx.vars[v] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required vars for macro "${macroName}": ${missing.join(', ')}`);
  }
  // Read template
  const templateText = await backend.readText(macro.templatePath);
  // Render
  const content = renderTemplate(templateText, ctx);
  // Compute output path
  const outPath = macro.outputPath(ctx);
  // Write
  await backend.write(outPath, content, { mkdirp: true });
  return {
    path: outPath,
    content,
    size: Buffer.byteLength(content, 'utf-8'),
  };
}
