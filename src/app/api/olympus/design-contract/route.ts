/**
 * /api/olympus/design-contract — v0.0.91.
 *
 * GET  ?slug=  → the page map + the contract (or a generated default) + the
 *                validation + the compact prompt block.
 * POST {slug, generate?|contract?|decision?|unknown?|resolveUnknown?}
 *              → write the contract and return the new validation.
 *
 * The contract is the artifact Apollo must resolve before a refactor plan;
 * the validation is the gate (P0 unknown or P0 page without a decision).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import {
  buildPageMap,
  contractPath,
  contractPrompt,
  defaultContract,
  readContract,
  validateContract,
  writeContract,
  type DesignContract,
} from '@/lib/design-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function laneFor(slug: string): string {
  const safe = String(slug || '').trim().replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return '';
  return resolveDispatchCwd(safe) || path.join(getVaultRoot(), '02_Projects', safe);
}

export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const laneRoot = laneFor(slug);
  if (!laneRoot || !fs.existsSync(laneRoot)) {
    return NextResponse.json({ ok: false, error: `lane not found: ${slug}` }, { status: 404 });
  }
  const existing = readContract(laneRoot);
  const contract = existing ?? defaultContract(laneRoot, slug, 'refactor');
  return NextResponse.json({
    ok: true,
    exists: Boolean(existing),
    path: contractPath(laneRoot),
    pages: buildPageMap(laneRoot),
    contract,
    validation: validateContract(existing ? contract : null),
    prompt: contractPrompt(existing ? contract : null),
  });
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

  let contract: DesignContract | null = readContract(laneRoot);
  if (body?.generate === true) {
    contract = defaultContract(laneRoot, slug, body?.mode === 'new' ? 'new' : body?.mode === 'rescue' ? 'rescue' : 'refactor');
  } else if (body?.contract && typeof body.contract === 'object') {
    contract = body.contract as DesignContract;
  } else if (body?.decision && typeof body.decision === 'object') {
    if (!contract) contract = defaultContract(laneRoot, slug, 'refactor');
    const route = String(body.decision.route || '');
    if (!route) return NextResponse.json({ ok: false, error: 'decision.route is required' }, { status: 400 });
    contract = {
      ...contract,
      pages: contract.pages.map((p) => p.route === route
        ? {
            ...p,
            purpose: typeof body.decision.purpose === 'string' ? body.decision.purpose : p.purpose,
            keep: Array.isArray(body.decision.keep) ? body.decision.keep.map(String) : p.keep,
            change: Array.isArray(body.decision.change) ? body.decision.change.map(String) : p.change,
            priority: body.decision.priority === 'P0' || body.decision.priority === 'P2' ? body.decision.priority : (body.decision.priority === 'P1' ? 'P1' : p.priority),
            status: body.decision.status === 'decided' ? 'decided' : p.status,
          }
        : p),
    };
  } else if (body?.unknown && typeof body.unknown === 'object') {
    if (!contract) contract = defaultContract(laneRoot, slug, 'refactor');
    contract = {
      ...contract,
      unknowns: [...contract.unknowns, {
        id: String(body.unknown.id || `unknown-${Date.now().toString(36)}`),
        page: body.unknown.page ? String(body.unknown.page) : undefined,
        severity: body.unknown.severity === 'P0' || body.unknown.severity === 'P2' ? body.unknown.severity : 'P1',
        question: String(body.unknown.question || ''),
        owner: body.unknown.owner === 'athena' || body.unknown.owner === 'user' ? body.unknown.owner : 'apollo',
      }],
    };
  } else if (body?.resolveUnknown) {
    if (!contract) return NextResponse.json({ ok: false, error: 'no contract' }, { status: 404 });
    contract = { ...contract, unknowns: contract.unknowns.filter((u) => u.id !== String(body.resolveUnknown)) };
  } else {
    return NextResponse.json({ ok: false, error: 'generate, contract, decision, unknown or resolveUnknown is required' }, { status: 400 });
  }

  if (!contract) return NextResponse.json({ ok: false, error: 'could not build the contract' }, { status: 500 });
  const saved = writeContract(laneRoot, contract);
  return NextResponse.json({
    ok: true,
    path: contractPath(laneRoot),
    contract: saved,
    validation: validateContract(saved),
    prompt: contractPrompt(saved),
  });
}
