/**
 * Mean Reversion Strategy
 * 
 * Fades extreme moves when price is extended from average.
 * Best for: Overextended moves in ranging markets.
 * Timeframe: Daily bars
 */

import type { Strategy, StrategySignal, IndicatorSnapshot } from './types';
import { noSignal } from './types';

export const MeanReversionStrategy: Strategy = {
    name: 'Mean Reversion',
    description: 'Fades overextended moves expecting a return to average',

    isApplicable(indicators: IndicatorSnapshot): boolean {
        return indicators.rsi !== null &&
            indicators.bbPercentB !== null &&
            indicators.adx !== null;
    },

    analyze(indicators: IndicatorSnapshot): StrategySignal {
        const {
            rsi, bbPercentB, bbLower, bbUpper, bbMiddle,
            price, atr, adx, adxTrend, vwap
        } = indicators;

        if (rsi === null || bbPercentB === null) {
            return noSignal('Missing RSI or Bollinger Band data');
        }

        const reasons: string[] = [];
        let score = 0;
        let direction: 'long' | 'short' | 'none' = 'none';

        // Mean reversion works best in low-trend environments
        const isTrending = adx !== null && adx > 25;
        if (isTrending) {
            return noSignal(`ADX at ${adx?.toFixed(0)} indicates strong trend - not ideal for mean reversion`);
        }

        // === OVERSOLD REVERSAL (Long) ===
        if (rsi < 30 && bbPercentB !== null && bbPercentB < 0.1) {
            direction = 'long';
            score += 40;
            reasons.push(`RSI oversold at ${rsi.toFixed(0)}`);
            reasons.push(`Price at lower Bollinger Band (${(bbPercentB * 100).toFixed(0)}%B)`);

            // Extra oversold
            if (rsi < 20) {
                score += 15;
                reasons.push('Extremely oversold (RSI < 20) - higher probability bounce');
            }

            // Below VWAP adds confluence
            if (vwap !== null && price < vwap) {
                score += 10;
                reasons.push(`Below VWAP ($${vwap.toFixed(2)}) - discount territory`);
            }

            // ADX showing weak trend is good for reversion
            if (adx !== null && adx < 20) {
                score += 10;
                reasons.push('Low ADX indicates ranging market (good for reversion)');
            }
        }

        // === OVERBOUGHT REVERSAL (Short) ===
        else if (rsi > 70 && bbPercentB !== null && bbPercentB > 0.9) {
            direction = 'short';
            score += 40;
            reasons.push(`RSI overbought at ${rsi.toFixed(0)}`);
            reasons.push(`Price at upper Bollinger Band (${(bbPercentB * 100).toFixed(0)}%B)`);

            // Extra overbought
            if (rsi > 80) {
                score += 15;
                reasons.push('Extremely overbought (RSI > 80) - higher probability pullback');
            }

            // Above VWAP adds confluence
            if (vwap !== null && price > vwap) {
                score += 10;
                reasons.push(`Above VWAP ($${vwap.toFixed(2)}) - premium territory`);
            }

            // ADX showing weak trend is good for reversion
            if (adx !== null && adx < 20) {
                score += 10;
                reasons.push('Low ADX indicates ranging market (good for reversion)');
            }
        }

        // === NO EXTREME ===
        else {
            return noSignal('RSI and Bollinger Bands not at extremes');
        }

        // Target: middle band (mean)
        const targetPrice = bbMiddle || price;

        // Invalidation: beyond the extreme
        const invalidation = direction === 'long'
            ? (bbLower || price) - (atr || price * 0.02)
            : (bbUpper || price) + (atr || price * 0.02);

        return {
            direction,
            score: Math.min(100, Math.max(0, score)),
            confidence: Math.min(1, score / 100),
            reasons,
            invalidation,
            targetPrice,
            stopLoss: invalidation,
        };
    },
};
