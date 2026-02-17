/**
 * Morning Run History API Route
 *
 * GET /api/morning-run/history?date=YYYY-MM-DD
 *
 * Returns prior run summaries. If date is provided, returns runs for that date only.
 * Otherwise returns runs for today.
 *
 * Backed by morning_run_runs table via morning-run-store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';
import { listMorningRunsByDate } from '@/lib/integration/morning-run-store';

export async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isServerSupabaseConfigured()) {
        return NextResponse.json({ success: true, runs: [], count: 0 });
    }

    try {
        const dateFilter = request.nextUrl.searchParams.get('date');
        const runDate = dateFilter ?? new Date().toISOString().slice(0, 10);

        const supabase = createServerSupabase();
        const runs = await listMorningRunsByDate(supabase, runDate);

        // Map to original response shape
        const mapped = runs.map(r => ({
            date: r.runDate,
            runId: r.runId,
            candidateCount: r.candidateCount,
            optionsCompleted: r.optionsCompleted,
            opportunityCount: r.opportunityCount,
            generatedAt: r.generatedAt,
        }));

        return NextResponse.json({
            success: true,
            runs: mapped,
            count: mapped.length,
        });
    } catch (error) {
        console.error('[MorningRunHistory] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
