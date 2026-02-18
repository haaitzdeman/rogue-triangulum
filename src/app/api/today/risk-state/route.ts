export const dynamic = 'force-dynamic';

/**
 * Today Risk State API Route
 *
 * GET /api/today/risk-state
 *
 * Returns the current daily risk state computed from today's journal entries.
 * Realized PnL sourced from immutable trade_ledger when available.
 */

import { NextResponse } from 'next/server';
import { computeDailyRiskState } from '@/lib/risk/risk-engine';
import { getRiskConfig } from '@/lib/risk/risk-config';
import { createServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';
import { loadRiskEntriesForDate } from '@/lib/risk/risk-loader';
import { loadRealizedPnLForDate } from '@/lib/accounting/trade-ledger-store';

export async function GET() {
    try {
        if (!isServerSupabaseConfigured()) {
            return NextResponse.json(
                { success: false, error: 'Server Supabase not configured' },
                { status: 503 },
            );
        }

        const today = new Date().toISOString().slice(0, 10);
        const config = getRiskConfig();
        const serverDb = createServerSupabase();
        const entries = await loadRiskEntriesForDate(serverDb, today);

        // Try to source realized PnL from immutable ledger
        let ledgerRealizedPnl: number | undefined;
        try {
            ledgerRealizedPnl = await loadRealizedPnLForDate(serverDb, today);
        } catch {
            // Ledger unavailable — fall back to journal-based realized PnL
        }

        const state = computeDailyRiskState(entries, config, { ledgerRealizedPnl });

        return NextResponse.json({
            success: true,
            date: today,
            ...state,
            config,
        });
    } catch (error) {
        console.error('[RiskState] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
