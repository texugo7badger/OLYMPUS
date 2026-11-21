/**
 * go-console-read.ts — v0.0.97: read the OpenCode GO console frame.
 *
 * The GO Console is already an OLYMPUS custom frame (a <webview>), so the
 * user's authenticated page is the source of truth. This pure parser reads
 * the visible text and returns the three account percentages + monthly reset;
 * the Frames view executes it on a 30s cadence while the console frame is
 * mounted. No credentials leave the webview.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface GoConsoleReading {
  monthlyPct: number;
  h5Pct: number;
  weeklyPct: number;
  resetAt: string;
  rollingResetAt?: string;
  weeklyResetAt?: string;
  modelMix?: Array<{ model: string; pct: number }>;
}

function pctNear(text: string, label: RegExp): number | null {
  const m = text.match(label);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : null;
}

function plusMonths(now: number, months: number): number {
  const d = new Date(now);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 18, 15, 0));
  return target.getTime();
}

/** Parse the console body text. Returns null when the three percentages are absent. */
export function parseGoConsoleText(text: string, now = Date.now()): GoConsoleReading | null {
  const clean = String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  // Monthly: the big "Monthly 44% used" heading, or the "44% Go Plus usage"
  // line, or the first percentage near "Go Plus usage".
  const monthly = pctNear(clean, /Monthly\s+(\d{1,3})%\s+used/i)
    ?? pctNear(clean, /(\d{1,3})%\s+Go Plus usage/i)
    ?? pctNear(clean, /Go Plus usage[\s\S]{0,160}?(\d{1,3})%/i);
  // Rolling: the console labels it "5-hour window" (older) or "Rolling" (new).
  const h5 = pctNear(clean, /5-hour window[\s\S]{0,160}?(\d{1,3})%\s+used/i)
    ?? pctNear(clean, /Rolling[\s\S]{0,160}?(\d{1,3})%\s+used/i)
    ?? pctNear(clean, /Rolling[\s\S]{0,80}?(\d{1,3})%/i);
  const weekly = pctNear(clean, /Weekly[\s\S]{0,160}?(\d{1,3})%\s+used/i)
    ?? pctNear(clean, /Weekly[\s\S]{0,80}?(\d{1,3})%/i);
  if (monthly == null || h5 == null || weekly == null) return null;

  // "Go Plus usage · Renews Dec 5 · On pace for 87%"
  let resetAt: string | null = null;
  const renew = clean.match(/Renews\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (renew) {
    const year = renew[3] ? Number(renew[3]) : new Date(now).getUTCFullYear();
    const parsed = Date.parse(`${renew[1]} ${renew[2]}, ${year} 18:15:00 UTC`);
    if (Number.isFinite(parsed)) {
      resetAt = new Date(parsed > now ? parsed : plusMonths(parsed, 12)).toISOString();
    }
  }
  if (!resetAt) resetAt = new Date(plusMonths(now, 1)).toISOString();

  const rollingReset = clean.match(/5-hour window\s+Resets\s+in\s+(\d+)h\s*(\d+)m/i)
    ?? clean.match(/Rolling\s+Resets\s+in\s+(\d+)h\s*(\d+)m/i);
  const weeklyReset = clean.match(/Weekly\s+Resets\s+in\s+(\d+)d\s*(\d+)h/i);
  const rollingResetAt = rollingReset
    ? new Date(now + (Number(rollingReset[1]) * 60 + Number(rollingReset[2])) * 60_000).toISOString()
    : undefined;
  const weeklyResetAt = weeklyReset
    ? new Date(now + (Number(weeklyReset[1]) * 24 + Number(weeklyReset[2])) * 3_600_000).toISOString()
    : undefined;

  // Optional model mix: "DeepSeek V4.1 Flash 1017 83%" in the Models card.
  const mix: Array<{ model: string; pct: number }> = [];
  const modelsSection = clean.match(/Models[\s\S]{0,1400}/i)?.[0] ?? '';
  for (const m of modelsSection.matchAll(/((?:[A-Za-z0-9][A-Za-z0-9 .:+_-]{2,40}?))\s+(\d{1,3})%\s*(?=$|\s)/g)) {
    const model = m[1].trim();
    const p = Number(m[2]);
    if (!model || !Number.isFinite(p) || /^(Monthly|Weekly|Rolling|Models|Limits|Extra)$/i.test(model)) continue;
    if (mix.some((x) => x.model === model)) continue;
    mix.push({ model, pct: Math.max(0, Math.min(100, p)) });
    if (mix.length >= 8) break;
  }

  return {
    monthlyPct: monthly,
    h5Pct: h5,
    weeklyPct: weekly,
    resetAt,
    ...(rollingResetAt ? { rollingResetAt } : {}),
    ...(weeklyResetAt ? { weeklyResetAt } : {}),
    ...(mix.length ? { modelMix: mix } : {}),
  };
}
