/**
 * Trend Following Strategy
 * 
 * Trades in direction of established trend using moving averages and ADX.
 * Best for: Strongly trending markets.
 * Timeframe: Daily bars
 */

import type { Strategy, StrategySignal, IndicatorSnapshot } from './types';
import { noSignal } from './types';

export const TrendFollowStrategy: Strategy = {
    name: 'Trend Follow',
    description: 'Follows established trends using moving averages and ADX',

    isApplicable(indicators: IndicatorSnapshot): boolean {
        return indicators.sma20 !== null &&
            indicators.sma50 !== null &&
            indicators.adx !== null;
    },

    analyze(indicators: IndicatorSnapshot): StrategySignal {
        const {
            price, sma20, sma50, ema9, adx, adxTrend,
            atr, nearestSupport, nearestResistance
        } = indicators;

        if (sma20 === null || sma50 === null || adx === null) {
            return noSignal('Missing moving average or ADX data');
        }

        const reasons: string[] = [];
        let score = 0;
        let direction: 'long' | 'short' | 'none' = 'none';

        // === UPTREND ===
        if (sma20 > sma50 && adxTrend === 'up') {
            direction = 'long';
            score += 35;
            reasons.push(`SMA20 ($${sma20.toFixed(2)}) above SMA50 ($${sma50.toFixed(2)})`);
            reasons.push('ADX confirms upward direction');

            // Strong trend bonus
            if (adx > 25) {
                score += 20;
                reasons.push(`Strong trend (ADX: ${adx.toFixed(0)})`);
            } else if (adx > 20) {
                score += 10;
                reasons.push(`Moderate trend (ADX: ${adx.toFixed(0)})`);
            } else {
                score -= 10;
                reasons.push(`Weak trend (ADX: ${adx.toFixed(0)}) - lower conviction`);
            }

            // Price above moving averages
            if (price > sma20) {
                score += 15;
                reasons.push('Price above SMA20 (riding the trend)');
            } else {
                reasons.push('⚠️ Price below SMA20 (trend may be weakening)');
            }

            // EMA alignment
            if (ema9 !== null && ema9 > sma20) {
                score += 10;
                reasons.push('EMA9 > SMA20 (short-term strength)');
            }
        }

        // === DOWNTREND ===
        else if (sma20 < sma50 && adxTrend === 'down') {
            direction = 'short';
            score += 35;
            reasons.push(`SMA20 ($${sma20.toFixed(2)}) below SMA50 ($${sma50.toFixed(2)})`);
            reasons.push('ADX confirms downward direction');

            // Strong trend bonus
            if (adx > 25) {
                score += 20;
                reasons.push(`Strong trend (ADX: ${adx.toFixed(0)})`);
            } else if (adx > 20) {
                score += 10;
                reasons.push(`Moderate trend (ADX: ${adx.toFixed(0)})`);
            } else {
                score -= 10;
                reasons.push(`Weak trend (ADX: ${adx.toFixed(0)}) - lower conviction`);
            }

            // Price below moving averages
            if (price < sma20) {
                score += 15;
                reasons.push('Price below SMA20 (riding the trend)');
            } else {
                reasons.push('⚠️ Price above SMA20 (trend may be weakening)');
            }

            // EMA alignment
            if (ema9 !== null && ema9 < sma20) {
                score += 10;
                reasons.push('EMA9 < SMA20 (short-term weakness)');
            }
        }

        // === NO CLEAR TREND ===
        else {
            if (adx < 20) {
                return noSignal(`No trend (ADX: ${adx.toFixed(0)}) - market is ranging`);
            }
            return noSignal('Moving averages not aligned with ADX direction');
        }

        // Invalidation: opposite side of trend MA
        const invalidation = direction === 'long'
            ? sma50 - (atr || price * 0.02)
            : sma50 + (atr || price * 0.02);

        // Target: extension in trend direction
        const targetPrice = direction === 'long'
            ? nearestResistance || price + (atr || price * 0.02) * 3
            : nearestSupport || price - (atr || price * 0.02) * 3;

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
