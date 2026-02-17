/**
 * Historical Analog Engine
 * 
 * Rule-based analog evaluation for gap outcomes.
 * Finds historical days with similar gaps and computes statistical outcomes.
 * 
 * TERMINOLOGY: "Analog", "Statistical", "Historical"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import type {
    AnalogConfig,
    AnalogDay,
    AnalogStats,
    HistoricalBar,
    RegimeTag,
} from './premarket-types';
import { DEFAULT_ANALOG_CONFIG } from './premarket-types';
import { computeGapPct, getGapDirection } from './gap-scanner';

/**
 * Detect regime based on ATR percentile
 */
export function detectRegime(bars: HistoricalBar[]): RegimeTag {
    if (bars.length < 20) return 'normal';

    // Calculate ATR for last 20 bars
    let atrSum = 0;
    for (let i = 1; i < Math.min(21, bars.length); i++) {
        const prevClose = bars[i - 1].close;
        const current = bars[i];
        const tr = Math.max(
            current.high - current.low,
            Math.abs(current.high - prevClose),
            Math.abs(current.low - prevClose)
        );
        atrSum += tr / prevClose; // Normalize by price
    }

    const avgAtrPct = (atrSum / Math.min(20, bars.length - 1)) * 100;

    // Regime buckets based on ATR percentile
    if (avgAtrPct < 1.0) return 'low_vol';
    if (avgAtrPct > 3.0) return 'high_vol';
    return 'normal';
}

/**
 * Build analog day from historical bar data
 */
export function buildAnalogDay(
    bar: HistoricalBar,
    prevBar: HistoricalBar,
    regime: RegimeTag,
    rDefinition: number
): AnalogDay {
    const gapPct = computeGapPct(prevBar.close, bar.open);
    const direction = getGapDirection(gapPct);

    // Day return: close-to-close
    const dayReturn = computeGapPct(prevBar.close, bar.close);

    // MFE: Maximum Favorable Excursion (open to best exit)
    const mfe = direction === 'UP'
        ? computeGapPct(bar.open, bar.high)
        : computeGapPct(bar.open, bar.low) * -1; // Invert for shorts

    // MAE: Maximum Adverse Excursion (open to worst point)
    const mae = direction === 'UP'
        ? computeGapPct(bar.open, bar.low)
        : computeGapPct(bar.open, bar.high) * -1; // Invert for shorts

    // Hit +1R before -1R?
    // For gap ups: did it hit +rDefinition% before hitting -rDefinition%?
    // For gap downs: did it hit -rDefinition% (favorable) before +rDefinition% (adverse)?
    let hitPlusR: boolean;
    if (direction === 'UP') {
        const upTarget = bar.open * (1 + rDefinition / 100);
        const downStop = bar.open * (1 - rDefinition / 100);
        // Simplified: if high >= target & low didn't hit stop first
        hitPlusR = bar.high >= upTarget && bar.low >= downStop;
    } else {
        const downTarget = bar.open * (1 - rDefinition / 100);
        const upStop = bar.open * (1 + rDefinition / 100);
        // Simplified: if low <= target & high didn't hit stop first
        hitPlusR = bar.low <= downTarget && bar.high <= upStop;
    }

    return {
        date: bar.date,
        gapPct: Math.round(gapPct * 100) / 100,
        direction,
        regime,
        dayReturn: Math.round(dayReturn * 100) / 100,
        mfe: Math.round(mfe * 100) / 100,
        mae: Math.round(mae * 100) / 100,
        hitPlusR,
    };
}

/**
 * Find historical analogs matching criteria
 */
export function findHistoricalAnalogs(
    bars: HistoricalBar[],
    todayGapPct: number,
    todayDirection: 'UP' | 'DOWN',
    config: AnalogConfig = DEFAULT_ANALOG_CONFIG
): AnalogDay[] {
    if (bars.length < 21) return [];

    const analogs: AnalogDay[] = [];

    // Iterate through historical bars (need previous bar for gap calc)
    for (let i = 1; i < bars.length; i++) {
        const prevBar = bars[i - 1];
        const currentBar = bars[i];

        // Compute gap for this historical day
        const historicalGapPct = computeGapPct(prevBar.close, currentBar.open);
        const historicalDirection = getGapDirection(historicalGapPct);

        // Match criteria:
        // 1. Same direction
        if (historicalDirection !== todayDirection) continue;

        // 2. Gap within band
        const gapDiff = Math.abs(historicalGapPct - todayGapPct);
        if (gapDiff > config.gapBandPct) continue;

        // 3. Detect regime (using bars up to this point)
        const barsUpToNow = bars.slice(0, i);
        const regime = detectRegime(barsUpToNow);

        // Build analog day
        const analogDay = buildAnalogDay(currentBar, prevBar, regime, config.rDefinition);
        analogs.push(analogDay);
    }

    return analogs;
}

/**
 * Compute aggregate statistics from analog days
 */
export function computeAnalogOutcomes(
    analogs: AnalogDay[],
    _config: AnalogConfig = DEFAULT_ANALOG_CONFIG
): AnalogStats {
    if (analogs.length === 0) {
        return {
            sampleSize: 0,
            hitRate: 0,
            avgMFE: 0,
            avgMAE: 0,
            continuationPct: 0,
            regimeTag: 'normal',
        };
    }

    const sampleSize = analogs.length;
    const hitCount = analogs.filter(a => a.hitPlusR).length;
    const hitRate = Math.round((hitCount / sampleSize) * 100) / 100;

    const avgMFE = Math.round(
        (analogs.reduce((sum, a) => sum + a.mfe, 0) / sampleSize) * 100
    ) / 100;

    const avgMAE = Math.round(
        (analogs.reduce((sum, a) => sum + a.mae, 0) / sampleSize) * 100
    ) / 100;

    const continuationPct = Math.round(
        (analogs.reduce((sum, a) => sum + a.dayReturn, 0) / sampleSize) * 100
    ) / 100;

    // Determine dominant regime
    const regimeCounts: Record<RegimeTag, number> = { low_vol: 0, normal: 0, high_vol: 0 };
    analogs.forEach(a => regimeCounts[a.regime]++);
    const regimeTag = (Object.entries(regimeCounts) as [RegimeTag, number][])
        .sort((a, b) => b[1] - a[1])[0][0];

    return {
        sampleSize,
        hitRate,
        avgMFE,
        avgMAE,
        continuationPct,
        regimeTag,
    };
}

/**
 * Check if sample size is sufficient
 */
export function isLowConfidence(
    stats: AnalogStats,
    config: AnalogConfig = DEFAULT_ANALOG_CONFIG
): boolean {
    return stats.sampleSize < config.minSampleSize;
}

/**
 * Main analog analysis function
 */
export function analyzeAnalogs(
    bars: HistoricalBar[],
    todayGapPct: number,
    todayDirection: 'UP' | 'DOWN',
    config: AnalogConfig = DEFAULT_ANALOG_CONFIG
): { analogs: AnalogDay[]; stats: AnalogStats; lowConfidence: boolean } {
    const analogs = findHistoricalAnalogs(bars, todayGapPct, todayDirection, config);
    const stats = computeAnalogOutcomes(analogs, config);
    const lowConfidence = isLowConfidence(stats, config);

    return { analogs, stats, lowConfidence };
}
