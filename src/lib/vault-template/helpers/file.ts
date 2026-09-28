/** Olympus template helper: `{{file.title}}`, `{{file.path}}`, `{{file.name}}`, `{{file.dir}}`. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';
import path from 'node:path';
import type { MacroContext } from '../../vault/types';

export function registerFileHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('file', function (this: MacroContext, prop: string) {
    const out: string =
      (this?.vars && (this.vars.__outputPath || this.vars.path)) || 'untitled.md';
    switch (prop) {
      case 'title':
        return path.basename(out, '.md');
      case 'path':
        return out;
      case 'name':
        return path.basename(out);
      case 'dir':
        return path.dirname(out);
      default:
        return '';
    }
  });
}
