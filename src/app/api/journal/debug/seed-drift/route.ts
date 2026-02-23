export const dynamic = 'force-dynamic';

/**
 * POST /api/journal/debug/seed-drift
 *
 * Seeds 200+ evaluated signals per score bucket to enable drift calculation.
 *
 * SECURITY:
 *   1. Kill switch: DEBUG_SEED_ROUTES_ENABLED must be "true" (default OFF)
 *   2. Admin gate: requires x-admin-token header
 *   3. No filesystem writes — uses in-memory signal store only
 *
 * DEV ONLY — disabled by default in all environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import type { SignalRecord, SignalOutcome } from '@/lib/journal/signal-types';

const STRATEGIES = ['Momentum', 'MeanReversion', 'TrendFollow', 'RSI_Oversold'];
const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META', 'AMD', 'NFLX', 'SPY'];

const BUCKET_TARGETS: { [bucket: string]: { count: number; winRate: number } } = {
    '60-69': { count: 220, winRate: 0.55 },
    '70-79': { count: 210, winRate: 0.62 },
};

export async function POST(request: NextRequest) {
    // ── Kill switch (FIRST check — before any logic) ─────────────────────
    if (process.env.DEBUG_SEED_ROUTES_ENABLED !== 'true') {
        return new NextResponse(null, { status: 404 });
    }

    // ── Admin gate ───────────────────────────────────────────────────────
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    // ── Lazy import to avoid fs side effects at module load ──────────────
    try {
        const { addSignals, addOutcome } = await import('@/lib/journal/signal-store');
        const now = Date.now();
        const signals: SignalRecord[] = [];
        const outcomes: SignalOutcome[] = [];

        let signalIndex = 0;

        for (const [bucket, config] of Object.entries(BUCKET_TARGETS)) {
            const [minScore, maxScore] = bucket.split('-').map(Number);
            const wins = Math.floor(config.count * config.winRate);
            const losses = config.count - wins;

            for (let i = 0; i < wins; i++) {
                const symbol = SYMBOLS[signalIndex % SYMBOLS.length];
                const strategy = STRATEGIES[signalIndex % STRATEGIES.length];
                const score = minScore + Math.floor(Math.random() * (maxScore - minScore + 1));
                const id = `${symbol}-drift-${now}-${signalIndex}`;
                const entryPrice = 100;
                const targetPrice = 110;

                signals.push({
                    id, version: 'V1', symbol, strategyName: strategy,
                    setupType: `${strategy} Signal`, direction: 'long', score,
                    confidence: score / 100, reasons: ['Drift test signal'],
                    signalBarTimestamp: now - (30 * 86400000) - (i * 3600000),
                    entryBarTimestamp: now - (29 * 86400000) - (i * 3600000),
                    referenceEntryDate: new Date(now - (29 * 86400000)).toISOString().slice(0, 10),
                    referenceEntryPrice: entryPrice, riskStop: 95, targetPrice,
                    targetR: 2, atrDollars: 2.5, atrPercent: 2.5,
                    regimeTrending: true, regimeHighVol: false, horizonDays: 7,
                    status: 'pending', createdAt: new Date().toISOString(),
                });

                const returnValue = 2.5 + Math.random() * 3;
                outcomes.push({
                    signalId: id, evaluatedAt: new Date().toISOString(), entryPrice,
                    return1Bar: returnValue * 0.3, return3Bar: returnValue * 0.6,
                    return7Bar: returnValue, return10Bar: returnValue * 1.1,
                    mfe: 4 + Math.random() * 2, mae: -1 - Math.random(),
                    hitTargetFirst: true, hitStopFirst: false, exitReason: 'target',
                    exitBar: 5, exitPrice: targetPrice,
                    expectedMove: (targetPrice - entryPrice) / entryPrice * 100,
                    realizedMove: returnValue,
                    errorVsExpected: returnValue - ((targetPrice - entryPrice) / entryPrice * 100),
                });
                signalIndex++;
            }

            for (let i = 0; i < losses; i++) {
                const symbol = SYMBOLS[signalIndex % SYMBOLS.length];
                const strategy = STRATEGIES[signalIndex % STRATEGIES.length];
                const score = minScore + Math.floor(Math.random() * (maxScore - minScore + 1));
                const id = `${symbol}-drift-${now}-${signalIndex}`;
                const entryPrice = 100;
                const stopPrice = 95;

                signals.push({
                    id, version: 'V1', symbol, strategyName: strategy,
                    setupType: `${strategy} Signal`, direction: 'long', score,
                    confidence: score / 100, reasons: ['Drift test signal'],
                    signalBarTimestamp: now - (30 * 86400000) - (i * 3600000),
                    entryBarTimestamp: now - (29 * 86400000) - (i * 3600000),
                    referenceEntryDate: new Date(now - (29 * 86400000)).toISOString().slice(0, 10),
                    referenceEntryPrice: entryPrice, riskStop: stopPrice, targetPrice: 110,
                    targetR: 2, atrDollars: 2.5, atrPercent: 2.5,
                    regimeTrending: true, regimeHighVol: false, horizonDays: 7,
                    status: 'pending', createdAt: new Date().toISOString(),
                });

                const returnValue = -2 - Math.random() * 2;
                outcomes.push({
                    signalId: id, evaluatedAt: new Date().toISOString(), entryPrice,
                    return1Bar: returnValue * 0.3, return3Bar: returnValue * 0.6,
                    return7Bar: returnValue, return10Bar: returnValue * 1.1,
                    mfe: 1 + Math.random(), mae: -3 - Math.random() * 2,
                    hitTargetFirst: false, hitStopFirst: true, exitReason: 'stop',
                    exitBar: 3, exitPrice: stopPrice, expectedMove: 10,
                    realizedMove: returnValue, errorVsExpected: returnValue - 10,
                });
                signalIndex++;
            }
        }

        const result = addSignals(signals);

        let outcomesAdded = 0;
        for (const outcome of outcomes) {
            if (addOutcome(outcome)) outcomesAdded++;
        }

        console.log(`[API] debug/seed-drift: signals=${result.added} outcomes=${outcomesAdded}`);

        return NextResponse.json({
            success: true,
            message: 'Seeded 200+ evaluated signals per score bucket for drift calculation',
            signalsAdded: result.added,
            signalsSkipped: result.skipped,
            outcomesAdded,
            buckets: Object.entries(BUCKET_TARGETS).map(([bucket, config]) => ({
                bucket,
                signalsGenerated: config.count,
                expectedRealizedWinRate: config.winRate,
            })),
        });
    } catch (error) {
        console.error('[API] Error seeding drift signals:', error);
        return NextResponse.json(
            { error: 'Failed to seed drift signals', details: String(error) },
            { status: 500 }
        );
    }
}
