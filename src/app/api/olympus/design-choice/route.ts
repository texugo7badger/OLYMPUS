/**
 * /api/olympus/design-choice — Athena's IN-CHAT design choice (v0.0.24).
 *
 * GET  → the latest pending design-choice event (options + suggestions).
 * POST → the user selected an option or asked for a refinement. Appends the
 *        event to live.jsonl and persists the decision to
 *        02_Projects/<slug>/design-decisions.jsonl (validated slug, append
 *        only). The terminal injects the user's answer as a normal chat
 *        message, so Athena sees it and either proceeds or proposes 3 new
 *        options.
 *
 * The old /api/olympus/design-review remains a thin alias.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT = getVaultRoot();
const FEED_PATH = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');
const TAIL_CAP_BYTES = 256 * 1024;
const TAIL_KEEP_LINES = 200;

const tail = { started: false, size: 0, partial: '', lines: [] as string[] };

function tailLines(): string[] {
  let st: fs.Stats;
  try { st = fs.statSync(FEED_PATH); } catch {
    tail.started = false; tail.size = 0; tail.partial = ''; tail.lines = [];
    return tail.lines;
  }
  const reseed = !tail.started || st.size < tail.size;
  const from = reseed ? Math.max(0, st.size - TAIL_CAP_BYTES) : tail.size;
  if (reseed) { tail.started = true; tail.partial = ''; tail.lines = []; }
  if (st.size <= from) return tail.lines;
  try {
    const fh = fs.openSync(FEED_PATH, 'r');
    try {
      const buf = Buffer.alloc(st.size - from);
      fs.readSync(fh, buf, 0, buf.length, from);
      tail.size = st.size;
      let chunk = tail.partial + buf.toString('utf-8');
      if (reseed && from > 0 && tail.partial === '' && chunk.includes('\n')) {
        chunk = chunk.slice(chunk.indexOf('\n') + 1);
      }
      const parts = chunk.split('\n');
      tail.partial = parts.pop() || '';
      for (const l of parts) {
        if (!l.trim()) continue;
        tail.lines.push(l);
        if (tail.lines.length > TAIL_KEEP_LINES) tail.lines.shift();
      }
    } finally { fs.closeSync(fh); }
  } catch { /* keep what we have */ }
  return tail.lines;
}

interface DesignOption {
  id: string;
  label: string;
  description?: string;
  kind?: string;
  svg?: string;
  imageUrl?: string;
  colors?: Array<{ role: string; hex: string }>;
  text?: string;
}

interface PendingChoice {
  reviewId: string;
  god: string;
  taskContext: string;
  options: DesignOption[];
  suggestions: string[];
  allowRefine: boolean;
  project: string | null;
  ts: string;
}

function parsePending(): PendingChoice | null {
  const lines = tailLines();
  const resolved = new Set<string>();
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if ((ev.action === 'design-choice-selected' || ev.action === 'design-choice-refined') && ev.review_id) {
        resolved.add(ev.review_id);
      }
    } catch { /* skip */ }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const ev = JSON.parse(lines[i]);
      if (ev.action !== 'design-choice-requested' || !ev.review_id) continue;
      if (resolved.has(ev.review_id)) continue;
      const options: DesignOption[] = Array.isArray(ev.options)
        ? ev.options.filter((o: any) => o && typeof o.label === 'string').slice(0, 6)
        : Array.isArray(ev.candidates)
          ? ev.candidates.map((c: any, n: number) => ({ id: `candidate-${n + 1}`, label: String(c?.name || `Option ${n + 1}`), description: String(c?.description || ''), kind: 'reference' }))
          : [];
      if (options.length === 0) continue;
      return {
        reviewId: String(ev.review_id),
        god: String(ev.god || 'athena'),
        taskContext: String(ev.task_context || ev.meta?.taskContext || ''),
        options,
        suggestions: Array.isArray(ev.suggestions) ? ev.suggestions.filter((s: any) => typeof s === 'string').slice(0, 6) : [],
        allowRefine: ev.allow_refine !== false,
        project: typeof ev.project === 'string' ? ev.project : (ev.meta?.project ?? null),
        ts: String(ev.ts || new Date().toISOString()),
      };
    } catch { /* skip */ }
  }
  return null;
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, choice: parsePending() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

function safeSlug(v: string | null | undefined): string | null {
  if (!v || typeof v !== 'string') return null;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(v)) return null;
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : '';
    const action = body?.action === 'refine' ? 'refine' : 'select';
    const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 600) : '';
    const optionId = typeof body?.optionId === 'string' ? body.optionId : '';
    if (!reviewId) return NextResponse.json({ ok: false, error: 'Missing reviewId' }, { status: 400 });
    if (action === 'refine' && !instruction) {
      return NextResponse.json({ ok: false, error: 'Write what Athena should change.' }, { status: 400 });
    }

    const pending = parsePending();
    if (!pending || pending.reviewId !== reviewId) {
      return NextResponse.json({ ok: false, error: 'This choice is no longer pending — ask Athena to show new options.' }, { status: 409 });
    }
    const option = pending.options.find((o) => o.id === optionId) ?? null;
    if (action === 'select' && !option) {
      return NextResponse.json({ ok: false, error: 'Pick one of the offered options.' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const event = {
      ts,
      god: pending.god,
      action: action === 'refine' ? 'design-choice-refined' : 'design-choice-selected',
      review_id: reviewId,
      option_id: option?.id ?? null,
      option_label: option?.label ?? null,
      instruction: action === 'refine' ? instruction : null,
      project: pending.project,
      msg:
        action === 'refine'
          ? `Design refinement requested for "${option?.label ?? 'the concept'}": ${instruction.slice(0, 120)}`
          : `Design choice selected: ${option?.label ?? optionId}`,
      meta: {
        reviewId,
        optionId: option?.id ?? null,
        optionLabel: option?.label ?? null,
        instruction: action === 'refine' ? instruction : null,
        project: pending.project,
      },
    };

    const dir = path.dirname(FEED_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(FEED_PATH, JSON.stringify(event) + '\n', 'utf-8');

    // Persist the decision in the project record (never outside the vault).
    const slug = safeSlug(pending.project);
    let savedPath: string | null = null;
    if (slug) {
      const projectDir = path.join(VAULT, '02_Projects', slug);
      if (fs.existsSync(projectDir)) {
        savedPath = path.join(projectDir, 'design-decisions.jsonl');
        const record = {
          ts,
          kind: action === 'refine' ? 'refinement' : 'choice',
          conversationId: typeof body?.conversationId === 'string' ? body.conversationId.slice(0, 120) : null,
          taskContext: pending.taskContext,
          option: option ? { id: option.id, label: option.label, kind: option.kind ?? null } : null,
          instruction: action === 'refine' ? instruction : null,
        };
        fs.appendFileSync(savedPath, JSON.stringify(record) + '\n', 'utf-8');
      }
    }

    return NextResponse.json({
      ok: true,
      event,
      savedPath,
      /** The message the UI should inject as the next user turn. */
      followUp:
        action === 'refine'
          ? `I want changes to "${option?.label ?? 'that concept'}": ${instruction}. Generate new options.`
          : `I chose "${option?.label}". Proceed with this direction.`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
