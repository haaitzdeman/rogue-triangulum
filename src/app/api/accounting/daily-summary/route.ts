export const dynamic = 'force-dynamic';

/**
 * Daily Accounting Summary API Route
 *
 * GET /api/accounting/daily-summary?date=YYYY-MM-DD
 *
 * Returns realized PnL, trade count, win rate, average R, and symbols
 * sourced exclusively from the immutable trade_ledger table.
 * Defaults to today if no date specified.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';

export async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isServerSupabaseConfigured()) {
        return NextResponse.json(
            { success: false, error: 'Server Supabase not configured' },
            { status: 503 },
        );
    }

    try {
        const dateParam = request.nextUrl.searchParams.get('date');
        const date = dateParam ?? new Date().toISOString().slice(0, 10);

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { success: false, error: 'Invalid date format. Use YYYY-MM-DD.' },
                { status: 400 },
            );
        }

        const supabase = createServerSupabase();
        const summary = await loadDailySummary(supabase, date);

        return NextResponse.json({
            success: true,
            date,
            ...summary,
        });
    } catch (error) {
        console.error('[DailySummary] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
