/**
 * Options Decision Layer
 *
 * Rule-based strategy selection for options trades.
 * No ML/AI — pure conditional logic based on IV rank and market context.
 *
 * Rules:
 * - High IV Rank (> 0.6) → Credit Spread (sell premium)
 * - Low IV Rank (< 0.3) → Debit Spread or Long Option
 * - Mid IV → Directional play based on available data
 * - AVOID when insufficient data or poor liquidity
 */

import type { StrategySuggestion, IVRankResult, OptionContract } from './options-types';

// =============================================================================
// Decision Result
// =============================================================================

export interface DecisionResult {
    suggestion: StrategySuggestion;
    rationale: string;
}

// =============================================================================
// Strategy Selection
// =============================================================================

/**
 * Select a strategy based on IV rank, available contracts, and liquidity.
 *
 * @param ivRank - IV rank result (may be null if insufficient data)
 * @param contracts - Filtered contracts that passed liquidity checks
 * @param underlyingPrice - Current underlying stock price
 * @param priceChangePct - Today's underlying price change percentage (optional, from Polygon snapshot)
 */
export function selectStrategy(
    ivRank: IVRankResult,
    contracts: OptionContract[],
    underlyingPrice: number,
    priceChangePct?: number,
): DecisionResult {
    // Rule 0: AVOID if no contracts survived liquidity filter
    if (contracts.length === 0) {
        return {
            suggestion: 'AVOID',
            rationale: 'No contracts passed liquidity filters. Insufficient open interest or volume to trade safely. Wait for better liquidity or choose a more liquid underlying.',
        };
    }

    // Rule 0b: AVOID if IV data is unavailable
    if (ivRank.lowData || ivRank.rank === null) {
        return {
            suggestion: 'AVOID',
            rationale: 'Insufficient implied volatility history to compute IV rank. Without IV context, strategy selection carries elevated risk. Flag: LOW_DATA.',
        };
    }

    const rank = ivRank.rank;
    const hasCalls = contracts.some(c => c.type === 'CALL');
    const hasPuts = contracts.some(c => c.type === 'PUT');
    const hasDirectionalMove = priceChangePct !== undefined && Math.abs(priceChangePct) > 2;
    const isBullish = priceChangePct !== undefined && priceChangePct > 0;

    // Rule 1: High IV (> 0.6) → Sell premium via credit spread
    if (rank > 0.6) {
        if (hasCalls && hasPuts) {
            return {
                suggestion: 'CREDIT_SPREAD',
                rationale: `IV rank is elevated at ${(rank * 100).toFixed(0)}%, placing it in the upper range. Implied volatility is historically rich, making it favorable to sell premium. A credit spread limits risk while collecting premium from inflated option prices. Consider a put credit spread if bullish, or a call credit spread if bearish.`,
            };
        }
        return {
            suggestion: 'CREDIT_SPREAD',
            rationale: `IV rank is ${(rank * 100).toFixed(0)}% (high). Premium is inflated — consider selling a credit spread to capture time decay. Limited contract availability may restrict strike selection.`,
        };
    }

    // Rule 2: Low IV (< 0.3) → Buy premium via debit spread or long option
    if (rank < 0.3) {
        // If there's a meaningful directional move, suggest a directional play
        if (hasDirectionalMove) {
            if (isBullish && hasCalls) {
                return {
                    suggestion: 'LONG_CALL',
                    rationale: `IV rank is low at ${(rank * 100).toFixed(0)}% with a bullish price move of ${priceChangePct?.toFixed(1)}%. Options are relatively cheap. A long call captures upside with defined risk. Low IV means less premium paid.`,
                };
            }
            if (!isBullish && hasPuts) {
                return {
                    suggestion: 'LONG_PUT',
                    rationale: `IV rank is low at ${(rank * 100).toFixed(0)}% with a bearish price move of ${priceChangePct?.toFixed(1)}%. Options are relatively cheap. A long put captures downside with defined risk. Low IV means less premium paid.`,
                };
            }
        }

        // Default low IV → debit spread
        return {
            suggestion: 'DEBIT_SPREAD',
            rationale: `IV rank is low at ${(rank * 100).toFixed(0)}%. Options are priced cheaply relative to historical levels. A debit spread provides a defined-risk directional bet while reducing premium outlay. Choose call spread if bullish, put spread if bearish.`,
        };
    }

    // Rule 3: Mid IV (0.3–0.6) → Directional play if meaningful price move
    if (hasDirectionalMove) {
        if (isBullish && hasCalls) {
            return {
                suggestion: 'LONG_CALL',
                rationale: `IV rank is moderate at ${(rank * 100).toFixed(0)}% with a significant bullish move of ${priceChangePct?.toFixed(1)}%. The directional bias supports a long call for continuation. IV is not extreme, so premium is reasonable.`,
            };
        }
        if (!isBullish && hasPuts) {
            return {
                suggestion: 'LONG_PUT',
                rationale: `IV rank is moderate at ${(rank * 100).toFixed(0)}% with a significant bearish move of ${priceChangePct?.toFixed(1)}%. Directional bias supports a long put. IV is moderate — premium is neither cheap nor expensive.`,
            };
        }
    }

    // Rule 4: Mid IV, no strong direction → debit spread as default
    return {
        suggestion: 'DEBIT_SPREAD',
        rationale: `IV rank is moderate at ${(rank * 100).toFixed(0)}%. No strong directional signal detected. A debit spread provides defined risk exposure. Consider both call and put spreads based on your market view.`,
    };
}
