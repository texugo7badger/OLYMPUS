/**
 * /api/olympus/athena/approve — v0.0.90: the human gate between a mark plan
 * and the campaign.
 *
 * Athena plans the mark in her chat; the user approves. The approval is a
 * DETERMINISTIC handoff (no model turn, no 240s wait): the approved plan is
 * written to `.olympus-hop-overrides.json` for the current/parked hop or the
 * next pending hop, and Atlas's warden consumes it on the next attempt. The
 * live plan is never rewritten.
 *
 * The first version asked Apollo for a model turn; under a live walk that turn
 * competed with the campaign and timed out at 240s, leaving the user with a
 * failed approval. The plan IS the instruction; the walker is the executor.
 * Apollo's deeper planning remains available from the terminal.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '@/lib/auth';
import { getVaultRoot } from '@/lib/vault-root';
import { appendGodInbox, updateGodInbox } from '@/lib/god-inbox';
import { appendActivity } from '@/lib/activity-feed';
import { loadHopState } from '@/lib/hop-runtime/hop-state';
import { readFrozenPlan, readPlanFile, planPath } from '@/lib/hop-runtime/plan-generation';
import { writeHopOverride } from '@/lib/hop-runtime/hop-overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const slug = String(body?.slug || '').trim().replace(/[^a-zA-Z0-9._-]/g, '');
  const plan = String(body?.plan || '').trim();
  const inboxId = typeof body?.inboxId === 'string' ? body.inboxId : null;
  if (!slug || !plan) {
    return NextResponse.json({ ok: false, error: 'slug and plan are required' }, { status: 400 });
  }
  const laneRoot = path.join(getVaultRoot(), '02_Projects', slug);
  if (!fs.existsSync(laneRoot)) {
    return NextResponse.json({ ok: false, error: `lane not found: ${slug}` }, { status: 404 });
  }

  const approval = appendGodInbox('athena', {
    role: 'system',
    text: `Approved by the user — Apollo's plan is a deterministic override; Atlas will apply it on the next hop attempt.`,
    source: 'system',
    status: 'running',
    meta: { kind: 'athena-approval', projectSlug: slug, approvedInbox: inboxId },
  });

  try {
    const state = loadHopState(laneRoot);
    const activePlan = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
    const completed = new Set(state?.completed ?? []);
    const hops = activePlan?.hops ?? [];
    const target = state?.parked?.hopId
      ?? hops.find((h) => !completed.has(h.id))?.id
      ?? hops[hops.length - 1]?.id
      ?? null;
    if (!target) {
      appendGodInbox('athena', {
        role: 'system',
        text: 'Approved, but the campaign has no hop to apply it to. Open the plan and stage a next generation from the Parthenon.',
        source: 'system', status: 'failed',
        meta: { projectSlug: slug, approvedInbox: inboxId },
      });
      updateGodInbox('athena', approval.id, { status: 'failed' });
      return NextResponse.json({ ok: false, error: 'no hop to apply the approved plan to' }, { status: 409 });
    }
    const override = writeHopOverride(laneRoot, target, {
      promptAppend: `ATHENA APPROVED MARK — the user approved this plan; apply it to this hop without changing the campaign structure:\n${plan}`,
      toolBudget: 24,
      reason: 'Athena approved mark',
    });
    appendGodInbox('athena', {
      role: 'system',
      text: `Atlas handoff: hop "${target}" now carries the approved plan as an override (attempt ${override.attempts ?? 1}). ${state?.parked?.hopId === target ? 'The warden will resume this parked hop.' : 'The walker will consume it on the next attempt.'} The live plan is untouched.`,
      source: 'dispatch', status: 'done',
      meta: { fromGod: 'atlas', projectSlug: slug, hop: target, approvedInbox: inboxId },
    });
    updateGodInbox('athena', approval.id, { status: 'done' });
    try {
      appendActivity({
        god: 'atlas', action: 'milestone', project: slug,
        msg: `Athena mark approved: hop "${target}" override written; the Atlas warden applies it on the next attempt.`,
        meta: { kind: 'athena-approval', hop: target, lane: laneRoot, inboxId },
      });
    } catch { /* best effort */ }
    return NextResponse.json({
      ok: true,
      handoff: 'atlas',
      hopId: target,
      message: `Approved — hop "${target}" carries the plan; Atlas applies it on the next attempt.`,
    });
  } catch (e: any) {
    appendGodInbox('athena', {
      role: 'system', text: `Atlas handoff failed: ${e?.message || String(e)}`,
      source: 'system', status: 'failed',
      meta: { projectSlug: slug, approvedInbox: inboxId },
    });
    updateGodInbox('athena', approval.id, { status: 'failed' });
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
