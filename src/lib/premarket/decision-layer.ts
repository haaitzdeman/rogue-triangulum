/**
 * Decision Layer
 * 
 * Rule-based play type decisions with explainable output.
 * Determines CONTINUATION, FADE, or AVOID based on analog statistics.
 * 
 * TERMINOLOGY: "Decision", "Rule-based", "Statistical"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import type {
    AnalogStats,
    PlayType,
    ConfidenceLevel,
    KeyLevels,
    GapData,
    GapCandidate,
} from './premarket-types';
import { getGapDirection } from './gap-scanner';

// =============================================================================
// Decision Thresholds
// =============================================================================

/**
 * Thresholds for play type decisions
 */
export const DECISION_THRESHOLDS = {
    // CONTINUATION requirements
    CONTINUATION_MIN_HIT_RATE: 0.55,    // >55% hit rate for +1R
    CONTINUATION_MIN_MFE: 1.0,          // >1.0% avg favorable excursion

    // FADE requirements
    FADE_MAX_HIT_RATE: 0.40,            // <40% hit rate suggests reversal
    FADE_MAX_CONTINUATION: -0.5,        // Negative continuation suggests fade

    // AVOID thresholds
    AVOID_MIN_SAMPLE: 10,               // Minimum samples to even consider
    AVOID_MAX_MAE: -2.5,                // If MAE exceeds -2.5%, too risky
};

// =============================================================================
// Play Type Decision
// =============================================================================

/**
 * Decide play type based on analog statistics
 */
export function decidePlayType(
    stats: AnalogStats,
    lowConfidence: boolean
): PlayType {
    const { sampleSize, hitRate, avgMFE, avgMAE, continuationPct } = stats;

    // AVOID: Insufficient data
    if (sampleSize < DECISION_THRESHOLDS.AVOID_MIN_SAMPLE) {
        return 'AVOID';
    }

    // AVOID: Excessive adverse excursion risk
    if (avgMAE < DECISION_THRESHOLDS.AVOID_MAX_MAE) {
        return 'AVOID';
    }

    // AVOID: Low confidence with neutral stats
    if (lowConfidence && hitRate >= 0.45 && hitRate <= 0.55) {
        return 'AVOID';
    }

    // CONTINUATION: Strong hit rate and favorable excursion
    if (
        hitRate >= DECISION_THRESHOLDS.CONTINUATION_MIN_HIT_RATE &&
        avgMFE >= DECISION_THRESHOLDS.CONTINUATION_MIN_MFE
    ) {
        return 'CONTINUATION';
    }

    // FADE: Low hit rate or negative continuation
    if (
        hitRate <= DECISION_THRESHOLDS.FADE_MAX_HIT_RATE ||
        continuationPct <= DECISION_THRESHOLDS.FADE_MAX_CONTINUATION
    ) {
        return 'FADE';
    }

    // Default: AVOID if statistics are mixed
    return 'AVOID';
}

// =============================================================================
// Entry Concept Generation
// =============================================================================

/**
 * Generate entry concept based on play type and gap direction
 */
export function generateEntryConcept(
    playType: PlayType,
    direction: 'UP' | 'DOWN'
): string {
    switch (playType) {
        case 'CONTINUATION':
            if (direction === 'UP') {
                return 'Wait for first 5-min range breakout above premarket high. Enter on confirmation with stop below opening range low.';
            } else {
                return 'Wait for first 5-min range breakdown below premarket low. Enter on confirmation with stop above opening range high.';
            }

        case 'FADE':
            if (direction === 'UP') {
                return 'Wait for rejection at/near premarket high. Enter short on failed breakout with stop above high of day.';
            } else {
                return 'Wait for rejection at/near premarket low. Enter long on failed breakdown with stop below low of day.';
            }

        case 'AVOID':
            return 'No trade recommended. Statistics are mixed or insufficient for reliable setup.';
    }
}

// =============================================================================
// Key Levels
// =============================================================================

/**
 * Build key levels for a candidate
 */
export function buildKeyLevels(gapData: GapData): KeyLevels {
    return {
        prevClose: Math.round(gapData.prevClose * 100) / 100,
        gapReferencePrice: Math.round(gapData.gapReferencePrice * 100) / 100,
        premarketHigh: gapData.premarketHigh
            ? Math.round(gapData.premarketHigh * 100) / 100
            : undefined,
        premarketLow: gapData.premarketLow
            ? Math.round(gapData.premarketLow * 100) / 100
            : undefined,
    };
}

// =============================================================================
// Invalidation Rule
// =============================================================================

/**
 * Generate invalidation rule
 */
export function generateInvalidation(
    playType: PlayType,
    direction: 'UP' | 'DOWN',
    keyLevels: KeyLevels
): string {
    switch (playType) {
        case 'CONTINUATION':
            if (direction === 'UP') {
                return `Invalidated if price closes below ${keyLevels.prevClose.toFixed(2)} (yesterday's close) within first 15 minutes.`;
            } else {
                return `Invalidated if price closes above ${keyLevels.prevClose.toFixed(2)} (yesterday's close) within first 15 minutes.`;
            }

        case 'FADE':
            if (direction === 'UP') {
                return `Invalidated if price makes new high above ${keyLevels.premarketHigh?.toFixed(2) || keyLevels.gapReferencePrice.toFixed(2)} with volume.`;
            } else {
                return `Invalidated if price makes new low below ${keyLevels.premarketLow?.toFixed(2) || keyLevels.gapReferencePrice.toFixed(2)} with volume.`;
            }

        case 'AVOID':
            return 'No invalidation rule - trade is not recommended.';
    }
}

// =============================================================================
// Risk Note
// =============================================================================

/**
 * Generate risk note based on statistics and data
 */
export function generateRiskNote(
    stats: AnalogStats,
    lowConfidence: boolean,
    avgDailyVolume20: number
): string {
    const risks: string[] = [];

    // Low confidence warning
    if (lowConfidence) {
        risks.push(`LOW SAMPLE: Only ${stats.sampleSize} historical analogs found`);
    }

    // Volatility regime warning
    if (stats.regimeTag === 'high_vol') {
        risks.push('HIGH VOLATILITY regime - expect wider swings');
    }

    // Liquidity warning
    if (avgDailyVolume20 < 2000000) {
        risks.push('LOWER LIQUIDITY - may have wider spreads');
    }

    // MAE warning
    if (stats.avgMAE < -1.5) {
        risks.push(`HIGH MAE RISK: Historical average adverse excursion of ${stats.avgMAE}%`);
    }

    return risks.length > 0 ? risks.join('. ') + '.' : 'Standard risk profile.';
}

// =============================================================================
// Because Paragraph
// =============================================================================

/**
 * Generate explainable "because" paragraph
 */
export function generateBecause(
    playType: PlayType,
    direction: 'UP' | 'DOWN',
    stats: AnalogStats,
    lowConfidence: boolean
): string {
    const directionWord = direction === 'UP' ? 'gap up' : 'gap down';
    const fadeWord = direction === 'UP' ? 'faded back down' : 'faded back up';

    const confidenceNote = lowConfidence
        ? `LOW CONFIDENCE: Only ${stats.sampleSize} analogs found (below threshold). `
        : '';

    switch (playType) {
        case 'CONTINUATION':
            return `${confidenceNote}Based on ${stats.sampleSize} historical ${directionWord} analogs with similar magnitude: ` +
                `${Math.round(stats.hitRate * 100)}% hit +1R before -1R, ` +
                `average favorable excursion was ${stats.avgMFE}%, ` +
                `and the average day return was ${stats.continuationPct}%. ` +
                `Historical data suggests continuation is statistically favorable in ${stats.regimeTag} volatility regime.`;

        case 'FADE':
            return `${confidenceNote}Based on ${stats.sampleSize} historical ${directionWord} analogs with similar magnitude: ` +
                `Only ${Math.round(stats.hitRate * 100)}% hit +1R before -1R, ` +
                `average adverse excursion was ${stats.avgMAE}%, ` +
                `and the average day return was ${stats.continuationPct}%. ` +
                `Historical data suggests these gaps often ${fadeWord} in ${stats.regimeTag} volatility regime.`;

        case 'AVOID':
            return `${confidenceNote}Based on ${stats.sampleSize} historical ${directionWord} analogs: ` +
                `Statistics are mixed (${Math.round(stats.hitRate * 100)}% hit rate, ${stats.continuationPct}% avg return). ` +
                `No clear statistical edge identified in ${stats.regimeTag} volatility regime. Trade not recommended.`;
    }
}

// =============================================================================
// Main Decision Function
// =============================================================================

/**
 * Build complete gap candidate with decision
 */
export function buildGapCandidate(
    gapData: GapData,
    stats: AnalogStats,
    lowConfidence: boolean
): GapCandidate {
    const direction = getGapDirection(gapData.gapPct);
    const playType = decidePlayType(stats, lowConfidence);
    const keyLevels = buildKeyLevels(gapData);

    const confidence: ConfidenceLevel = lowConfidence ? 'LOW' : 'HIGH';
    generateEntryConcept(playType, direction); // side-effect preserved
    const invalidation = generateInvalidation(playType, direction, keyLevels);
    const riskNote = generateRiskNote(stats, lowConfidence, gapData.avgDailyVolume20);
    const because = generateBecause(playType, direction, stats, lowConfidence);

    return {
        symbol: gapData.symbol,
        gapPct: gapData.gapPct,
        direction,
        prevClose: gapData.prevClose,
        gapReferencePrice: gapData.gapReferencePrice,
        avgDailyVolume20: gapData.avgDailyVolume20,
        dataMode: gapData.dataMode,
        playType,
        confidence,
        lowConfidence,
        because,
        keyLevels,
        invalidation,
        riskNote,
        analogStats: stats,
    };
}
