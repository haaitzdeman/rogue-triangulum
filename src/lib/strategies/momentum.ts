/**
 * Momentum Strategy
 * 
 * Trades in direction of momentum when RSI and MACD align.
 * Best for: Trending markets, continuation moves.
 */

import type { Strategy, StrategySignal, IndicatorSnapshot } from './types';
import { noSignal } from './types';

export const MomentumStrategy: Strategy = {
    name: 'Momentum',
    description: 'Follows strong directional moves using RSI and MACD',

    isApplicable(indicators: IndicatorSnapshot): boolean {
        // Need RSI and MACD to work
        return indicators.rsi !== null && indicators.macdHistogram !== null;
    },

    analyze(indicators: IndicatorSnapshot): StrategySignal {
        const { rsi, macdHistogram, macdLine, macdSignal, trendDirection, atr, price } = indicators;

        if (rsi === null || macdHistogram === null) {
            return noSignal('Missing momentum indicators');
        }

        const reasons: string[] = [];
        let score = 0;
        let direction: 'long' | 'short' | 'none' = 'none';

        // === LONG CONDITIONS ===
        if (rsi > 50 && rsi < 70 && macdHistogram > 0) {
            direction = 'long';
            score += 40;
            reasons.push(`RSI at ${rsi.toFixed(0)} shows bullish momentum`);
            reasons.push('MACD histogram positive (upward momentum)');

            // Bonus: MACD crossover
            if (macdLine !== null && macdSignal !== null && macdLine > macdSignal) {
                score += 15;
                reasons.push('MACD line above signal (bullish crossover)');
            }

            // Bonus: Aligned with trend
            if (trendDirection === 'bullish') {
                score += 20;
                reasons.push('Aligned with overall bullish trend');
            } else if (trendDirection === 'bearish') {
                score -= 20;
                reasons.push('⚠️ Counter-trend trade (higher risk)');
            }

            // RSI strength bonus
            if (rsi > 55 && rsi < 65) {
                score += 10;
                reasons.push('RSI in optimal momentum zone (55-65)');
            }
        }

        // === SHORT CONDITIONS ===
        else if (rsi < 50 && rsi > 30 && macdHistogram < 0) {
            direction = 'short';
            score += 40;
            reasons.push(`RSI at ${rsi.toFixed(0)} shows bearish momentum`);
            reasons.push('MACD histogram negative (downward momentum)');

            // Bonus: MACD crossover
            if (macdLine !== null && macdSignal !== null && macdLine < macdSignal) {
                score += 15;
                reasons.push('MACD line below signal (bearish crossover)');
            }

            // Bonus: Aligned with trend
            if (trendDirection === 'bearish') {
                score += 20;
                reasons.push('Aligned with overall bearish trend');
            } else if (trendDirection === 'bullish') {
                score -= 20;
                reasons.push('⚠️ Counter-trend trade (higher risk)');
            }

            // RSI strength bonus
            if (rsi < 45 && rsi > 35) {
                score += 10;
                reasons.push('RSI in optimal momentum zone (35-45)');
            }
        }

        // No clear signal
        else {
            if (rsi >= 70) {
                return noSignal('RSI overbought (70+) - wait for pullback');
            }
            if (rsi <= 30) {
                return noSignal('RSI oversold (30-) - wait for bounce');
            }
            return noSignal('RSI and MACD not aligned');
        }

        // Calculate invalidation level
        const invalidation = direction === 'long'
            ? price - (atr || price * 0.02) * 2
            : price + (atr || price * 0.02) * 2;

        // Calculate target
        const targetPrice = direction === 'long'
            ? price + (atr || price * 0.02) * 3
            : price - (atr || price * 0.02) * 3;

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
