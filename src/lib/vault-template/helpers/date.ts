/** Olympus template helper: `{{date}}`, `{{date "YYYY-MM-DD"}}`, `{{today}}`, etc. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';

function fmt(d: Date, format?: string): string {
  if (!format) return d.toISOString().slice(0, 10);
  // Minimal strftime-like substitution — covers the 80% case.
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return format
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/YY/g, String(d.getFullYear()).slice(-2))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/M/g, String(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/D/g, String(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/H/g, String(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

export function registerDateHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('date', (format?: string) => fmt(new Date(), format));
  hbs.registerHelper('today', () => fmt(new Date()));
  hbs.registerHelper('yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return fmt(d);
  });
  hbs.registerHelper('tomorrow', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return fmt(d);
  });
  hbs.registerHelper('now', () => new Date().toISOString());
}
