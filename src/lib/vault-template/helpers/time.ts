/** Olympus template helper: `{{time}}`, `{{time "HH:mm"}}`. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';

export function registerTimeHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('time', (format?: string) => {
    const d = new Date();
    if (!format) return d.toISOString().slice(11, 19);
    const pad = (n: number) => String(n).padStart(2, '0');
    return format
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()))
      .replace(/ss/g, pad(d.getSeconds()));
  });
}
