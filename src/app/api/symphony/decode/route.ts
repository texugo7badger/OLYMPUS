/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POST /api/symphony/decode
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Decoding Choir endpoint. Given a Signature + a Consensus, this
 *  endpoint synthesizes the user-facing text.
 *
 *  Body:
 *    {
 *      signature: VibrationalSignature,
 *      consensus: Consensus
 *    }
 *
 *  Response:
 *    {
 *      ok: true,
 *      output: ChoirOutput
 *    }
 *
 *  The ChoirOutput.text is what gets delivered to the user. The ChoirOutput
 *  also carries `mode` (symphony / augmented / fallback) and `coherence`,
 *  so the UI can display the Choir's status.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  decode,
  type VibrationalSignature,
  type Consensus,
} from '@/lib/symphony';

export const runtime = 'nodejs';

interface DecodeBody {
  signature: VibrationalSignature;
  consensus: Consensus;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DecodeBody;

    if (!body.signature || !body.consensus) {
      return NextResponse.json(
        { ok: false, error: 'Missing signature or consensus' },
        { status: 400 },
      );
    }

    if (body.signature.id !== body.consensus.signatureId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Signature ID does not match consensus.signatureId — refusing to decode mismatched pair',
        },
        { status: 400 },
      );
    }

    const output = decode(body.signature, body.consensus);

    return NextResponse.json({ ok: true, output });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'decode',
    description:
      'POST a signature + consensus to receive the Decoding Choir output.',
    protocol: 'symphony/1.0',
  });
}
