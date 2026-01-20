/**
 * Signal Outcome Evaluator
 * 
 * Evaluates pending signals against real market data.
 * Uses bar-indexed horizons (not calendar days) for proper alignment.
 * 
 * Called server-side only from API route.
 */

import type { SignalRecord, SignalOutcome } from './signal-types';
import { getPendingSignals, addOutcome, readStore, writeStore } from './signal-store';

// Polygon API types
interface PolygonBar {
    t: number;   // timestamp (ms)
    o: number;   // open
    h: number;   // high
    l: number;   // low
    c: number;   // close
    v: number;   // volume
}

interface PolygonResponse {
    results?: PolygonBar[];
    status?: string;
    error?: string;
}

/**
 * Fetch daily bars from Polygon
 */
async function fetchBars(
    symbol: string,
    from: string,
    to: string,
    apiKey: string
): Promise<PolygonBar[]> {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${apiKey}&limit=50`;

    try {
        const response = await fetch(url);
        const data = await response.json() as PolygonResponse;

        if (data.error) {
            console.error(`[Evaluator] Polygon error for ${symbol}:`, data.error);
            return [];
        }

        return data.results || [];
    } catch (error) {
        console.error(`[Evaluator] Failed to fetch bars for ${symbol}:`, error);
        return [];
    }
}

/**
 * Find bar index by timestamp
 */
function findBarIndex(bars: PolygonBar[], timestamp: number): number {
    // Find the bar with matching or closest timestamp
    for (let i = 0; i < bars.length; i++) {
        if (bars[i].t >= timestamp) {
            return i;
        }
    }
    return -1;
}

/**
 * Evaluate a single signal
 */
async function evaluateSignal(
    signal: SignalRecord,
    apiKey: string
): Promise<SignalOutcome | null> {
    // Calculate date range for fetching (signal date + 15 bars buffer)
    const signalDate = new Date(signal.signalBarTimestamp);
    const fromDate = new Date(signalDate);
    fromDate.setDate(fromDate.getDate() - 5); // A few days before for context

    const toDate = new Date(signalDate);
    toDate.setDate(toDate.getDate() + 20); // 20 calendar days for 10 trading bars

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    // Fetch bars
    const bars = await fetchBars(signal.symbol, fromStr, toStr, apiKey);

    if (bars.length < 12) {
        console.log(`[Evaluator] Not enough bars for ${signal.symbol} (${bars.length}), skipping`);
        return null;
    }

    // Find signal bar index
    const signalBarIdx = findBarIndex(bars, signal.signalBarTimestamp);
    if (signalBarIdx < 0) {
        console.log(`[Evaluator] Signal bar not found for ${signal.symbol}`);
        return null;
    }

    // Entry is next bar (D+1)
    const entryBarIdx = signalBarIdx + 1;
    if (entryBarIdx >= bars.length) {
        console.log(`[Evaluator] Entry bar not available for ${signal.symbol}`);
        return null;
    }

    // Check if we have enough bars for full horizon
    const horizonEndIdx = entryBarIdx + 10;
    if (horizonEndIdx >= bars.length) {
        console.log(`[Evaluator] Horizon not complete for ${signal.symbol} (need ${horizonEndIdx}, have ${bars.length})`);
        return null;
    }

    const entryBar = bars[entryBarIdx];
    const entryPrice = entryBar.o; // Entry at open

    // Returns at different horizons
    const bar1 = entryBarIdx + 1 < bars.length ? bars[entryBarIdx + 1] : null;
    const bar3 = entryBarIdx + 3 < bars.length ? bars[entryBarIdx + 3] : null;
    const bar7 = entryBarIdx + 7 < bars.length ? bars[entryBarIdx + 7] : null;
    const bar10 = entryBarIdx + 10 < bars.length ? bars[entryBarIdx + 10] : null;

    const direction = signal.direction;
    const isLong = direction === 'long';

    const calcReturn = (bar: PolygonBar | null): number | null => {
        if (!bar) return null;
        const move = isLong
            ? (bar.c - entryPrice) / entryPrice
            : (entryPrice - bar.c) / entryPrice;
        return move * 100; // Percent
    };

    const return1Bar = calcReturn(bar1);
    const return3Bar = calcReturn(bar3);
    const return7Bar = calcReturn(bar7);
    const return10Bar = calcReturn(bar10);

    // Calculate MFE and MAE within horizon
    let mfe = 0; // Max Favorable Excursion
    let mae = 0; // Max Adverse Excursion
    let hitTargetFirst = false;
    let hitStopFirst = false;
    let exitReason: 'target' | 'stop' | 'time' = 'time';
    let exitBar = 10;
    let exitPrice = bar10?.c || entryPrice;

    for (let i = 1; i <= 10; i++) {
        const barIdx = entryBarIdx + i;
        if (barIdx >= bars.length) break;

        const bar = bars[barIdx];

        // Check intrabar for stop/target hits
        const barHigh = bar.h;
        const barLow = bar.l;
        const barClose = bar.c;

        // Favorable excursion
        const favorable = isLong
            ? (barHigh - entryPrice) / entryPrice
            : (entryPrice - barLow) / entryPrice;
        if (favorable > mfe) mfe = favorable;

        // Adverse excursion
        const adverse = isLong
            ? (entryPrice - barLow) / entryPrice
            : (barHigh - entryPrice) / entryPrice;
        if (adverse > mae) mae = adverse;

        // Check stop hit
        if (!hitStopFirst && !hitTargetFirst) {
            if (isLong && barLow <= signal.riskStop) {
                hitStopFirst = true;
                exitReason = 'stop';
                exitBar = i;
                exitPrice = signal.riskStop;
            } else if (!isLong && barHigh >= signal.riskStop) {
                hitStopFirst = true;
                exitReason = 'stop';
                exitBar = i;
                exitPrice = signal.riskStop;
            }
        }

        // Check target hit
        if (!hitStopFirst && !hitTargetFirst) {
            if (isLong && barHigh >= signal.targetPrice) {
                hitTargetFirst = true;
                exitReason = 'target';
                exitBar = i;
                exitPrice = signal.targetPrice;
            } else if (!isLong && barLow <= signal.targetPrice) {
                hitTargetFirst = true;
                exitReason = 'target';
                exitBar = i;
                exitPrice = signal.targetPrice;
            }
        }
    }

    // Convert to percentages
    mfe = mfe * 100;
    mae = mae * 100;

    // Calculate error vs expected
    const expectedMove = signal.atrPercent * 1.5; // Expected move in ATR
    const realizedMove = return7Bar ?? 0;
    const errorVsExpected = realizedMove - (isLong ? expectedMove : -expectedMove);

    return {
        signalId: signal.id,
        evaluatedAt: new Date().toISOString(),
        entryPrice,
        return1Bar,
        return3Bar,
        return7Bar,
        return10Bar,
        mfe,
        mae,
        hitTargetFirst,
        hitStopFirst,
        exitReason,
        exitBar,
        exitPrice,
        expectedMove: isLong ? expectedMove : -expectedMove,
        realizedMove,
        errorVsExpected,
    };
}

/**
 * Evaluate all pending signals
 */
export async function evaluateSignalOutcomes(
    apiKey?: string
): Promise<{ evaluated: number; skipped: number; errors: number }> {
    const key = apiKey || process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY;

    if (!key) {
        console.error('[Evaluator] No Polygon API key available');
        return { evaluated: 0, skipped: 0, errors: 1 };
    }

    const pending = getPendingSignals();
    console.log(`[Evaluator] Found ${pending.length} pending signals to evaluate`);

    let evaluated = 0;
    let skipped = 0;
    let errors = 0;

    for (const signal of pending) {
        try {
            // Rate limit: 5 calls/minute for Polygon starter
            await new Promise(r => setTimeout(r, 250));

            const outcome = await evaluateSignal(signal, key);

            if (outcome) {
                addOutcome(outcome);
                evaluated++;
                console.log(`[Evaluator] Evaluated ${signal.symbol}: ${outcome.exitReason}`);
            } else {
                skipped++;
            }
        } catch (error) {
            console.error(`[Evaluator] Error evaluating ${signal.symbol}:`, error);
            errors++;
        }
    }

    console.log(`[Evaluator] Complete: evaluated=${evaluated}, skipped=${skipped}, errors=${errors}`);

    return { evaluated, skipped, errors };
}

/**
 * Force re-evaluate a specific signal
 */
export async function reEvaluateSignal(
    signalId: string,
    apiKey?: string
): Promise<SignalOutcome | null> {
    const key = apiKey || process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY;

    if (!key) {
        console.error('[Evaluator] No Polygon API key available');
        return null;
    }

    const store = readStore();
    const signal = store.signals.find(s => s.id === signalId);

    if (!signal) {
        console.error(`[Evaluator] Signal not found: ${signalId}`);
        return null;
    }

    const outcome = await evaluateSignal(signal, key);

    if (outcome) {
        addOutcome(outcome);
    }

    return outcome;
}
