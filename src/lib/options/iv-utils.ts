/**
 * IV (Implied Volatility) Utilities
 *
 * IV Rank computation and classification.
 * Pure functions — no API calls, no side effects.
 */

import type { IVRankResult, IVRankClassification } from './options-types';

// =============================================================================
// IV Rank Computation
// =============================================================================

/**
 * Compute IV rank using simple percentile:
 *   (currentIV - yearLowIV) / (yearHighIV - yearLowIV)
 *
 * Returns null rank + lowData flag if historical IV is not available.
 *
 * @param currentIV - Current implied volatility (decimal)
 * @param yearLowIV - 1-year low IV (decimal), or null if unavailable
 * @param yearHighIV - 1-year high IV (decimal), or null if unavailable
 */
export function computeIVRank(
    currentIV: number,
    yearLowIV: number | null,
    yearHighIV: number | null,
): IVRankResult {
    // Guard: insufficient historical data
    if (yearLowIV === null || yearHighIV === null || yearLowIV < 0 || yearHighIV < 0) {
        return {
            rank: null,
            classification: null,
            lowData: true,
        };
    }

    // Guard: degenerate range (high == low)
    const range = yearHighIV - yearLowIV;
    if (range <= 0) {
        return {
            rank: null,
            classification: null,
            lowData: true,
        };
    }

    // Compute rank, clamped to [0, 1]
    const rawRank = (currentIV - yearLowIV) / range;
    const rank = Math.max(0, Math.min(1, rawRank));

    return {
        rank,
        classification: classifyIVRank(rank),
        lowData: false,
    };
}

// =============================================================================
// Classification
// =============================================================================

/**
 * Classify IV rank into HIGH / MID / LOW bucket.
 *
 * HIGH: > 0.6
 * MID:  0.3 – 0.6
 * LOW:  < 0.3
 */
export function classifyIVRank(rank: number): IVRankClassification {
    if (rank > 0.6) return 'HIGH';
    if (rank < 0.3) return 'LOW';
    return 'MID';
}

/**
 * Format IV rank for display.
 * Returns "—" if null, otherwise formatted as percentage.
 */
export function formatIVRank(rank: number | null): string {
    if (rank === null) return '—';
    return `${(rank * 100).toFixed(0)}%`;
}
