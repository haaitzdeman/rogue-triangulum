export const dynamic = 'force-dynamic';

/**
 * GET /api/journal
 * 
 * Get signals, outcomes, and aggregated stats.
 * Supports filtering by symbol, strategy, status, date range.
 * 
 * Query params:
 *   - includeSeed: if "true", include V1-SEED signals in stats (default: false)
 */

import { NextResponse } from 'next/server';
import { getSignals, getOutcomes, computeStats } from '@/lib/journal/signal-store';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse includeSeed flag
        const includeSeed = searchParams.get('includeSeed') === 'true';

        const filters = {
            symbol: searchParams.get('symbol') || undefined,
            strategy: searchParams.get('strategy') || undefined,
            status: (searchParams.get('status') as 'pending' | 'evaluated' | 'all') || 'all',
            startDate: searchParams.get('startDate') || undefined,
            endDate: searchParams.get('endDate') || undefined,
            limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
        };

        const signals = getSignals(filters);
        const outcomes = getOutcomes();

        // Stats exclude V1-SEED by default
        const stats = computeStats(includeSeed);

        // Filter signals list by version too if not including seed
        const filteredSignals = includeSeed
            ? signals
            : signals.filter(s => s.version === 'V1');

        // Match outcomes to signals
        const outcomeMap = new Map(outcomes.map(o => [o.signalId, o]));
        const signalsWithOutcomes = filteredSignals.map(s => ({
            ...s,
            outcome: outcomeMap.get(s.id) || null,
        }));

        console.log(`[API] journal GET includeSeed=${includeSeed} signals=${signalsWithOutcomes.length}`);

        return NextResponse.json({
            success: true,
            signals: signalsWithOutcomes,
            stats,
            count: signalsWithOutcomes.length,
            includeSeed,
        });
    } catch (error) {
        console.error('[API] Error getting journal:', error);
        return NextResponse.json(
            { error: 'Failed to get journal', details: String(error) },
            { status: 500 }
        );
    }
}
