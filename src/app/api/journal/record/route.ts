export const dynamic = 'force-dynamic';

/**
 * POST /api/journal/record
 * 
 * Record scan results to the signal journal.
 * All writes happen server-side only.
 */

import { NextResponse } from 'next/server';
import { recordScanResults } from '@/lib/journal/signal-recorder';
import type { CandidateForRecording } from '@/lib/journal/signal-types';

interface RecordRequest {
    candidates: CandidateForRecording[];
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as RecordRequest;

        console.log(`[API] journal record received candidates=${body.candidates?.length ?? 0}`);

        if (!body.candidates || !Array.isArray(body.candidates)) {
            console.log('[API] journal record INVALID: candidates array required');
            return NextResponse.json(
                { error: 'Invalid request: candidates array required' },
                { status: 400 }
            );
        }

        const result = await recordScanResults(body.candidates);

        console.log(`[API] journal record added=${result.added} skipped=${result.skipped}`);

        return NextResponse.json({
            success: true,
            added: result.added,
            skipped: result.skipped,
        });
    } catch (error) {
        console.error('[API] Error recording signals:', error);
        return NextResponse.json(
            { error: 'Failed to record signals', details: String(error) },
            { status: 500 }
        );
    }
}

