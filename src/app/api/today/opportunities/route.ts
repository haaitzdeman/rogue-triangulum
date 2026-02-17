/**
 * Today Opportunities API Route
 *
 * GET /api/today/opportunities
 *
 * Cross-references today's premarket gap scan with today's options scans.
 * Returns a ranked list of opportunities sorted by overall score.
 * Includes journal status for each symbol (PLANNED/ENTERED/EXITED/null).
 *
 * Uses shared buildTodayOpportunities() from today-builder.ts
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildTodayOpportunities } from '@/lib/integration/today-builder';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);

// =============================================================================
// GET Handler
// =============================================================================

export async function GET() {
    try {
        const date = new Date().toISOString().slice(0, 10);
        const result = buildTodayOpportunities(date);

        // Fetch journal status for today's symbols
        const journalStatusMap: Record<string, { status: string; pnl?: number }> = {};

        try {
            const { data: entries } = await supabase
                .from('premarket_journal_entries')
                .select('symbol, status, realized_pnl_dollars')
                .eq('effective_date', date);

            if (entries) {
                for (const entry of entries) {
                    const sym = (entry.symbol as string).toUpperCase();
                    // Keep highest-priority status (EXITED > ENTERED > PLANNED)
                    const priority: Record<string, number> = { EXITED: 3, ENTERED: 2, PLANNED: 1, OPEN: 1 };
                    const existing = journalStatusMap[sym];
                    const newPriority = priority[entry.status as string] || 0;
                    if (!existing || newPriority > (priority[existing.status] || 0)) {
                        journalStatusMap[sym] = {
                            status: entry.status as string,
                            pnl: entry.realized_pnl_dollars as number | undefined,
                        };
                    }
                }
            }
        } catch {
            // Journal lookup is best-effort
        }

        // Enrich opportunities with journal status
        const enriched = result.opportunities.map(opp => ({
            ...opp,
            journalStatus: journalStatusMap[opp.symbol.toUpperCase()]?.status || null,
            journalPnl: journalStatusMap[opp.symbol.toUpperCase()]?.pnl ?? null,
        }));

        return NextResponse.json({
            success: true,
            date,
            opportunities: enriched,
            count: enriched.length,
            sources: result.sources,
            freshness: result.freshness,
        });
    } catch (error) {
        console.error('[TodayOpportunities] Error:', error);
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
