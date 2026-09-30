/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runVaultPrune, loadVaultPolicy, saveVaultPolicy, type VaultPolicy } from '@/lib/vault-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/vault/prune
 *   Returns the current vault policy + a dry-run preview of what WOULD be
 *   pruned if the policy ran live. Safe to call anytime — never modifies files.
 *
 * POST /api/olympus/vault/prune
 *   Body: { action: 'run' | 'set-policy', dryRun?: boolean, policy?: Partial<VaultPolicy> }
 *   - action='run': runs the prune with the current (or override) policy.
 *     If dryRun is true (the default), no files are modified — just preview.
 *   - action='set-policy': updates the persisted policy in
 *     ~/.olympus/vault-policy.json. Returns the new policy.
 */
export async function GET() {
  try {
    const policy = loadVaultPolicy();
    // Always dry-run for GET — this is a preview.
    const result = runVaultPrune({ ...policy, dryRun: true });
    return NextResponse.json({
      ok: true,
      policy,
      preview: result,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'set-policy') {
      const current = loadVaultPolicy();
      const patch = body.policy || {};
      const updated: VaultPolicy = {
        ...current,
        ...patch,
        // Validate numeric fields.
        maxActivityFeedMB: Number.isFinite(patch.maxActivityFeedMB) ? Math.max(1, patch.maxActivityFeedMB) : current.maxActivityFeedMB,
        maxShortCircuitLogMB: Number.isFinite(patch.maxShortCircuitLogMB) ? Math.max(1, patch.maxShortCircuitLogMB) : current.maxShortCircuitLogMB,
        maxVibrationsMB: Number.isFinite(patch.maxVibrationsMB) ? Math.max(1, patch.maxVibrationsMB) : current.maxVibrationsMB,
        maxBenchmarkLogMB: Number.isFinite(patch.maxBenchmarkLogMB) ? Math.max(1, patch.maxBenchmarkLogMB) : current.maxBenchmarkLogMB,
        instinctMaxAgeDays: Number.isFinite(patch.instinctMaxAgeDays) ? Math.max(1, patch.instinctMaxAgeDays) : current.instinctMaxAgeDays,
        archiveOlderThanDays: Number.isFinite(patch.archiveOlderThanDays) ? Math.max(1, patch.archiveOlderThanDays) : current.archiveOlderThanDays,
        autoPruneOnIdle: typeof patch.autoPruneOnIdle === 'boolean' ? patch.autoPruneOnIdle : current.autoPruneOnIdle,
        dryRun: typeof patch.dryRun === 'boolean' ? patch.dryRun : current.dryRun,
        minFileAgeHours: Number.isFinite(patch.minFileAgeHours) ? Math.max(0, patch.minFileAgeHours) : current.minFileAgeHours,
      };
      saveVaultPolicy(updated);
      return NextResponse.json({ ok: true, policy: updated });
    }

    if (action === 'run') {
      const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : true;
      const result = runVaultPrune({ dryRun });
      return NextResponse.json({
        ok: true,
        result,
        message: dryRun
          ? `Dry-run preview: ${result.actions.length} action(s) would be taken (${(result.totalBytesAffected / (1024 * 1024)).toFixed(1)} MB affected).`
          : `Live prune complete: ${result.actions.length} action(s) taken, ${(result.totalBytesAffected / (1024 * 1024)).toFixed(1)} MB freed.`,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Missing or invalid `action`. Expected "run" or "set-policy".' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
