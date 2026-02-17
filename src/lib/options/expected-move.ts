/**
 * Expected Move Calculator
 *
 * Calculates expected price move based on implied volatility and time to expiration.
 * Formula: ExpectedMove = underlyingPrice * IV * sqrt(daysToExpiration / 365)
 *
 * Pure function — no side effects.
 */

import type { ExpectedMoveResult } from './options-types';

// =============================================================================
// Expected Move Computation
// =============================================================================

/**
 * Compute the expected move for an underlying stock.
 *
 * @param underlyingPrice - Current price of the underlying stock
 * @param impliedVolatility - IV as a decimal (e.g. 0.35 for 35%)
 * @param daysToExpiration - Days until the nearest options expiration
 * @returns Expected move in dollars and the expected price range
 */
export function computeExpectedMove(
    underlyingPrice: number,
    impliedVolatility: number,
    daysToExpiration: number,
): ExpectedMoveResult {
    // Guard: zero or negative inputs
    if (underlyingPrice <= 0 || impliedVolatility <= 0 || daysToExpiration <= 0) {
        return {
            expectedMove: 0,
            expectedRange: {
                low: underlyingPrice,
                high: underlyingPrice,
            },
        };
    }

    const expectedMove = underlyingPrice * impliedVolatility * Math.sqrt(daysToExpiration / 365);

    return {
        expectedMove: Math.round(expectedMove * 100) / 100,
        expectedRange: {
            low: Math.round((underlyingPrice - expectedMove) * 100) / 100,
            high: Math.round((underlyingPrice + expectedMove) * 100) / 100,
        },
    };
}

/**
 * Format expected move for display.
 */
export function formatExpectedMove(result: ExpectedMoveResult): string {
    if (result.expectedMove === 0) return '—';
    return `±$${result.expectedMove.toFixed(2)} ($${result.expectedRange.low.toFixed(2)} – $${result.expectedRange.high.toFixed(2)})`;
}
