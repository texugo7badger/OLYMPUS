/** Olympus template helper: `{{olympus.root}}`, `{{olympus.vault}}`, `{{olympus.now}}`. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';
import { getVaultRoot } from '../../vault-root';

export function registerOlympusHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('olympus', (prop: string) => {
    switch (prop) {
      case 'root':
        return process.env.OLYMPUS_ROOT || process.cwd();
      case 'vault':
        return getVaultRoot();
      case 'now':
        return new Date().toISOString();
      case 'god':
        return process.env.OLYMPUS_GOD || 'apollo';
      case 'session':
        return process.env.OLYMPUS_SESSION_ID || '';
      case 'plan':
        return process.env.OLYMPUS_PLAN_VERSION || 'v1';
      default:
        return '';
    }
  });
}
