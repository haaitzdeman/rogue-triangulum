/**
 * Breakout Strategy
 * 
 * Identifies breakouts from consolidation using Bollinger Bands and volume.
 * Best for: Range-bound markets transitioning to trending.
 */

import type { Strategy, StrategySignal, IndicatorSnapshot } from './types';
import { noSignal } from './types';

export const BreakoutStrategy: Strategy = {
    name: 'Breakout',
    description: 'Detects price breaking out of ranges with volume confirmation',

    isApplicable(indicators: IndicatorSnapshot): boolean {
        return indicators.bbUpper !== null &&
            indicators.bbLower !== null &&
            indicators.volumeRatio !== null;
    },

    analyze(indicators: IndicatorSnapshot): StrategySignal {
        const {
            price, bbUpper, bbLower, bbMiddle, bbPercentB,
            volumeRatio, atr, nearestResistance, nearestSupport,
            high, low
        } = indicators;

        if (bbUpper === null || bbLower === null || volumeRatio === null) {
            return noSignal('Missing Bollinger Band or volume data');
        }

        const reasons: string[] = [];
        let score = 0;
        let direction: 'long' | 'short' | 'none' = 'none';

        // === UPSIDE BREAKOUT ===
        if (price > bbUpper) {
            direction = 'long';
            score += 35;
            reasons.push(`Price ($${price.toFixed(2)}) above upper BB ($${bbUpper.toFixed(2)})`);

            // Volume confirmation is key for breakouts
            if (volumeRatio > 1.5) {
                score += 25;
                reasons.push(`Strong volume (${(volumeRatio * 100).toFixed(0)}% of average)`);
            } else if (volumeRatio > 1.0) {
                score += 10;
                reasons.push(`Above-average volume (${(volumeRatio * 100).toFixed(0)}%)`);
            } else {
                score -= 15;
                reasons.push('⚠️ Low volume breakout - may be false');
            }

            // Breaking resistance adds conviction
            if (nearestResistance !== null && price > nearestResistance) {
                score += 15;
                reasons.push(`Cleared resistance at $${nearestResistance.toFixed(2)}`);
            }

            // Strong bar adds conviction
            const barRange = high - low;
            if (atr && barRange > atr * 1.2) {
                score += 10;
                reasons.push('Strong breakout bar (larger than average)');
            }
        }

        // === DOWNSIDE BREAKOUT ===
        else if (price < bbLower) {
            direction = 'short';
            score += 35;
            reasons.push(`Price ($${price.toFixed(2)}) below lower BB ($${bbLower.toFixed(2)})`);

            // Volume confirmation
            if (volumeRatio > 1.5) {
                score += 25;
                reasons.push(`Strong volume (${(volumeRatio * 100).toFixed(0)}% of average)`);
            } else if (volumeRatio > 1.0) {
                score += 10;
                reasons.push(`Above-average volume (${(volumeRatio * 100).toFixed(0)}%)`);
            } else {
                score -= 15;
                reasons.push('⚠️ Low volume breakdown - may be false');
            }

            // Breaking support adds conviction
            if (nearestSupport !== null && price < nearestSupport) {
                score += 15;
                reasons.push(`Broke support at $${nearestSupport.toFixed(2)}`);
            }

            // Strong bar adds conviction
            const barRange = high - low;
            if (atr && barRange > atr * 1.2) {
                score += 10;
                reasons.push('Strong breakdown bar (larger than average)');
            }
        }

        // === NO BREAKOUT ===
        else {
            // Check for squeeze (potential breakout setup)
            if (bbPercentB !== null && bbPercentB > 0.3 && bbPercentB < 0.7) {
                return noSignal(`Consolidating (BB %B: ${(bbPercentB * 100).toFixed(0)}%) - wait for breakout`);
            }
            return noSignal('Price within Bollinger Bands');
        }

        // Invalidation: back inside the bands
        const invalidation = direction === 'long'
            ? bbMiddle || price * 0.98
            : bbMiddle || price * 1.02;

        // Target: extension from breakout
        const extension = atr ? atr * 2 : (bbUpper - bbLower) / 2;
        const targetPrice = direction === 'long'
            ? price + extension
            : price - extension;

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
