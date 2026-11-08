/**
 * design-approval.ts — v0.0.91: the human signature on the design gate.
 *
 * A design review is an opinion; the approval is the user's decision. The
 * artifact binds three hashes so it cannot silently outlive the thing it
 * approved:
 *   - contractHash: the pages/tokens/stops the user agreed to;
 *   - reviewHash:   the exact review that was on screen when they approved;
 *   - screenshotHash: optional, the visual that was approved.
 *
 * The gate rule is deliberately strict: no approval, no pass — and an
 * approval is only valid when the review is >= 7. A low score cannot be
 * papered over with a click.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DesignContract } from './design-contract';

export interface DesignApproval {
  version: 1;
  project: string;
  page: string;
  variant?: string | null;
  note?: string | null;
  approvedBy: 'user';
  approvedAt: string;
  contractHash: string;
  reviewHash: string;
  screenshotHash: string | null;
  scoreAtApproval: number | null;
}

export interface ApprovalValidation {
  ok: boolean;
  reasons: string[];
  approval: DesignApproval | null;
}

export function approvalPath(laneRoot: string): string {
  return path.join(laneRoot, 'design-approval.json');
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function hashFile(file: string): string | null {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
}

/** Stable hash of the decisions the user approved (updatedAt is excluded). */
export function contractHash(contract: DesignContract): string {
  return hashText(JSON.stringify({
    project: contract.project,
    mode: contract.mode,
    pages: contract.pages,
    tokens: contract.tokens,
    signature: contract.signature,
    stops: contract.stops,
    unknowns: contract.unknowns,
  }));
}

export function reviewHash(review: any): string {
  return hashText(JSON.stringify({
    overall: review?.overall ?? null,
    measuredAt: review?.measuredAt ?? null,
    scores: review?.scores ?? null,
  }));
}

/** The latest review by measuredAt (root vs frontdoor), or null. */
export function readLatestReview(laneRoot: string): any | null {
  const read = (rel: string): any | null => {
    try { return JSON.parse(fs.readFileSync(path.join(laneRoot, rel), 'utf-8')); } catch { return null; }
  };
  const root = read('design-review.json');
  const frontdoor = read('evidence/frontdoor/design-review.json');
  const ts = (r: any): number => {
    const t = Date.parse(String(r?.measuredAt ?? ''));
    return Number.isFinite(t) ? t : 0;
  };
  return ts(frontdoor) > ts(root) ? frontdoor : (root ?? frontdoor);
}

export function readApproval(laneRoot: string): DesignApproval | null {
  try {
    const raw = JSON.parse(fs.readFileSync(approvalPath(laneRoot), 'utf-8')) as DesignApproval;
    return raw?.version === 1 && raw.contractHash ? raw : null;
  } catch { return null; }
}

export function writeApproval(laneRoot: string, approval: DesignApproval): DesignApproval {
  fs.writeFileSync(approvalPath(laneRoot), JSON.stringify(approval, null, 2) + '\n', 'utf-8');
  return approval;
}

export function clearApproval(laneRoot: string): void {
  try { fs.rmSync(approvalPath(laneRoot), { force: true }); } catch { /* best effort */ }
}

/**
 * The gate: approval exists, it was given for THIS contract, THIS review and
 * a review score >= 7. A missing review is a failure, not an excuse.
 */
export function validateApproval(
  approval: DesignApproval | null,
  contract: DesignContract | null,
  review: any | null,
): ApprovalValidation {
  const reasons: string[] = [];
  if (!approval) {
    return { ok: false, reasons: ['no design-approval.json — the user has not signed the design'], approval: null };
  }
  if (!contract) reasons.push('no design-contract.json — the approval has nothing to bind to');
  else if (approval.contractHash !== contractHash(contract)) reasons.push('the contract changed after approval');
  if (!review) reasons.push('no design-review.json — the score is unknown');
  else if (approval.reviewHash !== reviewHash(review)) reasons.push('the design review changed after approval');
  const score = typeof review?.overall === 'number' ? review.overall : null;
  if (score == null) reasons.push('the design review has no overall score');
  else if (score < 7) reasons.push(`the design score is ${score} < 7`);
  return { ok: reasons.length === 0, reasons, approval };
}
