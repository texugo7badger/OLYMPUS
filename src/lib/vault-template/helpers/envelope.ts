/** Olympus template helper: `{{envelopeId}}`, `{{sessionId}}`, `{{planVersion}}`, `{{tokenBudget}}`. 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Handlebars from 'handlebars';
import { randomUUID } from 'node:crypto';
import type { MacroContext } from '../../vault/types';

export function registerEnvelopeHelpers(hbs: typeof Handlebars): void {
  hbs.registerHelper('envelopeId', function (this: MacroContext) {
    return this?.vars?.envelopeId || `env-${randomUUID().slice(0, 8)}`;
  });
  hbs.registerHelper('sessionId', function (this: MacroContext) {
    return this?.sessionId || process.env.OLYMPUS_SESSION_ID || `sess-${Date.now()}`;
  });
  hbs.registerHelper('planVersion', function (this: MacroContext) {
    return this?.planVersion || process.env.OLYMPUS_PLAN_VERSION || 'v1';
  });
  hbs.registerHelper('tokenBudget', function () {
    return process.env.OLYMPUS_TOKEN_BUDGET || '50000';
  });
}
