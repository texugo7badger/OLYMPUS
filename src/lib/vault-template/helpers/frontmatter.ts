/** Olympus template helper: `{{fm "key"}}` — read frontmatter of current file. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';
import { parseFrontmatter } from '../../vault/frontmatter';
import type { MacroContext } from '../../vault/types';

export function registerFrontmatterHelpers(hbs: typeof Handlebars): void {
  // `fm` is a synchronous helper — but we don't have the file content at
  // template-render time. The convention is: the macro runner sets
  // ctx.vars.__sourceFrontmatter = { ... } when rendering inside an existing
  // file (e.g. for `update-frontmatter` flows). For new-file macros, `fm`
  // returns the var of the same name from ctx.vars.
  hbs.registerHelper('fm', function (this: MacroContext, key: string) {
    if (this?.vars?.__sourceFrontmatter && typeof this.vars.__sourceFrontmatter === 'object') {
      const v = (this.vars.__sourceFrontmatter as Record<string, unknown>)[key];
      return v === undefined ? '' : String(v);
    }
    if (this?.vars && key in this.vars) {
      return String(this.vars[key]);
    }
    return '';
  });
}

export { parseFrontmatter };
