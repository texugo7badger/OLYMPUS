/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POST /api/symphony/harmonize
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Orchestra's reply endpoint. A Demigod POSTs its work as a structured
 *  result, and this endpoint:
 *
 *    1. Wraps the result into a HarmonicPattern (with Vault anchor).
 *    2. Returns the harmonic to the caller for forwarding to the Conductor.
 *
 *  In production, this endpoint is called by Symphony-aware demigods that
 *  have finished their work. The Conductor collects the harmonics via a
 *  separate channel (a Promise collector, a queue, or a websocket).
 *
 *  Body:
 *    {
 *      signatureId: "...",
 *      demigod: "build-resolver",
 *      outcomes: HarmonicOutcome[],
 *      artifacts: ArtifactPointer[],
 *      contextRead: "src/auth/jwt.rs, Cargo.toml",
 *      tokensConsumed: 1234,
 *      durationMs: 5678,
 *      confidence: 0.92,
 *      error?: { code, message, recoverable }
 *    }
 *
 *  Response:
 *    {
 *      ok: true,
 *      harmonic: HarmonicPattern
 *    }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  harmonicFromResult,
  harmonicFromError,
  type HarmonicOutcome,
  type ArtifactPointer,
} from '@/lib/symphony';

export const runtime = 'nodejs';

interface HarmonizeBody {
  signatureId: string;
  demigod: string;
  outcomes?: HarmonicOutcome[];
  artifacts?: ArtifactPointer[];
  contextRead?: string;
  tokensConsumed?: number;
  durationMs?: number;
  confidence?: number;
  error?: { code: string; message: string; recoverable: boolean };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HarmonizeBody;

    if (!body.signatureId || !body.demigod) {
      return NextResponse.json(
        { ok: false, error: 'Missing signatureId or demigod' },
        { status: 400 },
      );
    }

    let harmonic;
    if (body.error) {
      harmonic = harmonicFromError({
        signatureId: body.signatureId,
        demigod: body.demigod,
        error: body.error,
        tokensConsumed: body.tokensConsumed ?? 0,
        durationMs: body.durationMs ?? 0,
      });
    } else {
      harmonic = harmonicFromResult({
        signatureId: body.signatureId,
        demigod: body.demigod,
        outcomes: body.outcomes ?? [],
        artifacts: body.artifacts ?? [],
        contextRead: body.contextRead ?? '',
        tokensConsumed: body.tokensConsumed ?? 0,
        durationMs: body.durationMs ?? 0,
        confidence: body.confidence ?? 0.85,
      });
    }

    return NextResponse.json({ ok: true, harmonic });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'harmonize',
    description:
      'POST a demigod result to receive a HarmonicPattern for the Conductor.',
    protocol: 'symphony/1.0',
  });
}
