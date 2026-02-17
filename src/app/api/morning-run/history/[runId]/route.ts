/**
 * Morning Run History — Single Run Retrieval
 *
 * GET /api/morning-run/history/{runId}
 *
 * Loads a single run by runId from the morning_run_runs table.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';
import { loadMorningRunByRunId } from '@/lib/integration/morning-run-store';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
    const { runId } = await params;

    if (!runId || runId.length < 4) {
        return NextResponse.json(
            { success: false, error: 'Invalid runId' },
            { status: 400 },
        );
    }

    // Sanitize: only allow alphanumeric + hyphens
    if (!/^[a-zA-Z0-9-]+$/.test(runId)) {
        return NextResponse.json(
            { success: false, error: 'Invalid runId format' },
            { status: 400 },
        );
    }

    if (!isServerSupabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'No morning run data found' },
            { status: 404 },
        );
    }

    try {
        const supabase = createServerSupabase();
        const result = await loadMorningRunByRunId(supabase, runId);

        if (!result) {
            return NextResponse.json(
                { success: false, error: `Run ${runId} not found` },
                { status: 404 },
            );
        }

        const { payload, runDate } = result as { payload: unknown; runDate: string };

        return NextResponse.json({
            success: true,
            run: payload,
            foundIn: runDate,
        });
    } catch (err) {
        console.error('[MorningRunHistory] error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal error' },
            { status: 500 },
        );
    }
}
