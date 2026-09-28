/** Olympus template helper: `{{god.name}}`, `{{god.glyph}}`, `{{god.domain}}`. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';
import type { MacroContext } from '../../vault/types';

interface GodInfo {
  name: string;
  glyph: string;
  domain: string;
}

const GODS: Record<string, GodInfo> = {
  apollo: { name: 'Apollo', glyph: '☀️', domain: 'Master Planner — Architecture, Planning, Spec Interview' },
  hephaestus: { name: 'Hephaestus', glyph: '🔨', domain: 'Backend, Rust, Code Review' },
  athena: { name: 'Athena', glyph: '🦉', domain: 'Frontend, UX, Design Systems' },
  hermes: { name: 'Hermes', glyph: '🪽', domain: 'APIs, Integrations, Third-Party' },
  artemis: { name: 'Artemis', glyph: '🏹', domain: 'Security, Audits, Vulnerabilities' },
  dionysus: { name: 'Dionysus', glyph: '🍷', domain: 'Testing, QA, Chaos' },
  persephone: { name: 'Persephone', glyph: '🌱', domain: 'Database, Migrations, Data' },
  prometheus: { name: 'Prometheus', glyph: '🔥', domain: 'DevOps, CI/CD, Infrastructure' },
  atlas: { name: 'Atlas', glyph: '🌐', domain: 'Orchestration, Dispatch Execution, Progress Tracking' },
  callimachus: { name: 'Callimachus', glyph: '📜', domain: 'Vault Curation, Instinct Lifecycle, Docs' },
};

export function registerGodHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('god', function (this: MacroContext, prop: string) {
    const godId: string = this?.god || process.env.OLYMPUS_GOD || 'apollo';
    const info = GODS[godId.toLowerCase()];
    if (!info) return '';
    switch (prop) {
      case 'name':
        return info.name;
      case 'glyph':
        return info.glyph;
      case 'domain':
        return info.domain;
      case 'id':
        return godId.toLowerCase();
      default:
        return '';
    }
  });
}
