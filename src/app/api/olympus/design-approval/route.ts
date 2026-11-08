/**
 * /api/olympus/design-approval — v0.0.91.
 *
 * GET  ?slug=  → the contract, the latest review, the approval and the gate.
 * POST {slug, page?, variant?, note?, screenshotPath?} → sign the design.
 * POST {slug, undo:true} → withdraw the signature.
 *
 * A low score cannot be approved: the route refuses with 409 and names the
 * gate. That is the difference between "the user clicked" and "the design
 * passed".
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import { readContract, validateContract } from '@/lib/design-contract';
import {
  approvalPath,
  clearApproval,
  contractHash,
  hashFile,
  readApproval,
  readLatestReview,
  reviewHash,
  validateApproval,
  writeApproval,
  type DesignApproval,
} from '@/lib/design-approval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function laneFor(slug: string): string {
  const safe = String(slug || '').trim().replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return '';
  return resolveDispatchCwd(safe) || path.join(getVaultRoot(), '02_Projects', safe);
}

function payload(laneRoot: string) {
  const contract = readContract(laneRoot);
  const review = readLatestReview(laneRoot);
  const approval = readApproval(laneRoot);
  return {
    contract,
    contractValidation: validateContract(contract),
    review,
    approval,
    approvalValidation: validateApproval(approval, contract, review),
    approvalPath: approvalPath(laneRoot),
  };
}

export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const laneRoot = laneFor(slug);
  if (!laneRoot || !fs.existsSync(laneRoot)) {
    return NextResponse.json({ ok: false, error: `lane not found: ${slug}` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, slug, ...payload(laneRoot) });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const slug = String(body?.slug || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const laneRoot = laneFor(slug);
  if (!laneRoot || !fs.existsSync(laneRoot)) {
    return NextResponse.json({ ok: false, error: `lane not found: ${slug}` }, { status: 404 });
  }

  if (body?.undo === true) {
    clearApproval(laneRoot);
    return NextResponse.json({ ok: true, undone: true, ...payload(laneRoot) });
  }

  const contract = readContract(laneRoot);
  if (!contract) {
    return NextResponse.json({ ok: false, error: 'no design-contract.json — generate and decide it first' }, { status: 409 });
  }
  const review = readLatestReview(laneRoot);
  const score = typeof review?.overall === 'number' ? review.overall : null;
  if (score == null) {
    return NextResponse.json({ ok: false, error: 'no design-review.json — run the design review first' }, { status: 409 });
  }
  if (score < 7) {
    return NextResponse.json({
      ok: false,
      error: `design score ${score} < 7 — fix the review findings before approving`,
      review,
      contract,
    }, { status: 409 });
  }

  const screenshotPath = typeof body?.screenshotPath === 'string' ? body.screenshotPath : '';
  const screenshotHash = screenshotPath ? hashFile(path.isAbsolute(screenshotPath) ? screenshotPath : path.join(laneRoot, screenshotPath)) : null;
  const approval: DesignApproval = {
    version: 1,
    project: slug,
    page: typeof body?.page === 'string' && body.page ? body.page : 'project',
    variant: typeof body?.variant === 'string' && body.variant ? body.variant : null,
    note: typeof body?.note === 'string' && body.note ? body.note : null,
    approvedBy: 'user',
    approvedAt: new Date().toISOString(),
    contractHash: contractHash(contract),
    reviewHash: reviewHash(review),
    screenshotHash,
    scoreAtApproval: score,
  };
  writeApproval(laneRoot, approval);
  // payload() re-reads the file, so the response and the disk cannot diverge.
  return NextResponse.json({ ok: true, ...payload(laneRoot) });
}
