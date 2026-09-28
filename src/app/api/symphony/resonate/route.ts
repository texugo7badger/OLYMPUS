/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POST /api/symphony/resonate
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Composer's endpoint. A God POSTs a free-text payload + a target
 *  orchestra, and this endpoint returns a fully-formed VibrationalSignature
 *  ready for broadcast.
 *
 *  Body:
 *    {
 *      composer: "apollo",
 *      payload: "Build a JWT auth service in Rust...",
 *      targetOrchestra: ["build-resolver", "code-verifier"],
 *      parentSignature?: "...",
 *      ttl?: 300000,
 *      stackHints?: ["rust"],
 *      constraints?: { ... },
 *      successPredicates?: [ ... ]
 *    }
 *
 *  Response:
 *    {
 *      signature: VibrationalSignature,
 *      economyEstimate: SignatureEconomyEstimate
 *    }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  composeSignature,
  estimateSignatureEconomy,
  type SignatureCompositionInput,
} from '@/lib/symphony';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignatureCompositionInput & {
      payload: string;
    };

    if (!body.composer || !body.payload || !body.targetOrchestra?.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing required fields: composer, payload, targetOrchestra',
        },
        { status: 400 },
      );
    }

    const signature = composeSignature({
      composer: body.composer,
      payload: body.payload,
      targetOrchestra: body.targetOrchestra,
      parentSignature: body.parentSignature,
      ttl: body.ttl,
      stackHints: body.stackHints,
      constraints: body.constraints,
      successPredicates: body.successPredicates,
    });

    const economyEstimate = estimateSignatureEconomy(
      signature,
      body.payload.length,
    );

    return NextResponse.json({
      ok: true,
      signature,
      economyEstimate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * GET — return a small health/info payload.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'resonate',
    description:
      'POST a composer + payload + targetOrchestra to receive a VibrationalSignature.',
    protocol: 'symphony/1.0',
  });
}
