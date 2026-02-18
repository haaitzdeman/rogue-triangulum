export const dynamic = 'force-dynamic';

/**
 * POST /api/journal/debug/seed
 * 
 * Seeds fake signals with realistic fields for verification.
 * Marked with version: "V1-SEED" to distinguish from real signals.
 * 
 * DEV ONLY - for testing journal UI without waiting for real scans.
 */

import { NextResponse } from 'next/server';
import { addSignals } from '@/lib/journal/signal-store';
import type { SignalRecord } from '@/lib/journal/signal-types';

export async function POST() {
    try {
        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);

        const seedSignals: SignalRecord[] = [
            {
                id: `AAPL-${now}-momentum-seed`,
                version: 'V1-SEED',  // SEED marker - excluded from stats by default
                symbol: 'AAPL',
                strategyName: 'Momentum',
                setupType: 'Momentum RSI Breakout',
                direction: 'long',
                score: 78,
                confidence: 0.78,
                reasons: ['RSI crossing 50 from below', 'MACD bullish crossover', 'Above SMA20'],
                signalBarTimestamp: now - (10 * 24 * 60 * 60 * 1000), // 10 days ago
                entryBarTimestamp: null,
                referenceEntryDate: today,
                referenceEntryPrice: null,
                riskStop: 175.50,
                targetPrice: 195.00,
                targetR: 2,
                atrDollars: 4.50,
                atrPercent: 2.4,
                regimeTrending: false,  // No fake regime tags
                regimeHighVol: false,
                horizonDays: 7,
                status: 'pending',
                createdAt: new Date().toISOString(),
            },
            {
                id: `TSLA-${now}-meanrev-seed`,
                version: 'V1-SEED',  // SEED marker - excluded from stats by default
                symbol: 'TSLA',
                strategyName: 'MeanReversion',
                setupType: 'Mean Reversion Oversold',
                direction: 'long',
                score: 65,
                confidence: 0.65,
                reasons: ['RSI below 30', 'Price at lower Bollinger Band', 'Volume spike'],
                signalBarTimestamp: now - (15 * 24 * 60 * 60 * 1000), // 15 days ago
                entryBarTimestamp: null,
                referenceEntryDate: today,
                referenceEntryPrice: null,
                riskStop: 230.00,
                targetPrice: 280.00,
                targetR: 2,
                atrDollars: 12.00,
                atrPercent: 4.8,
                regimeTrending: false,  // No fake regime tags
                regimeHighVol: false,
                horizonDays: 7,
                status: 'pending',
                createdAt: new Date().toISOString(),
            },
        ];

        const result = addSignals(seedSignals);

        console.log(`[API] debug/seed added=${result.added} skipped=${result.skipped} version=V1-SEED`);

        return NextResponse.json({
            success: true,
            message: 'Seeded test signals with version V1-SEED',
            added: result.added,
            skipped: result.skipped,
        });
    } catch (error) {
        console.error('[API] Error seeding signals:', error);
        return NextResponse.json(
            { error: 'Failed to seed signals', details: String(error) },
            { status: 500 }
        );
    }
}
