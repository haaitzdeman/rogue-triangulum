/**
 * Strategy Types
 * 
 * A Strategy analyzes market data and produces a trading signal.
 * NO FAKE LEARNING - just honest rule-based analysis.
 */

import type { Bar } from '../indicators';

/**
 * Trading direction
 */
export type Direction = 'long' | 'short' | 'none';

/**
 * Result from running a strategy
 */
export interface StrategySignal {
    direction: Direction;
    score: number;           // 0-100, higher = stronger signal
    confidence: number;      // 0-1, how certain
    reasons: string[];       // Human-readable explanations
    invalidation: number | null;  // Price level that invalidates the trade
    targetPrice?: number;    // Optional price target
    stopLoss?: number;       // Suggested stop loss
}

/**
 * Indicator values passed to strategies
 */
export interface IndicatorSnapshot {
    // Price
    price: number;
    open: number;
    high: number;
    low: number;

    // Trend
    sma20: number | null;
    sma50: number | null;
    ema9: number | null;
    trendDirection: 'bullish' | 'bearish' | 'neutral';

    // Momentum
    rsi: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    stochK: number | null;
    stochD: number | null;

    // Volatility
    atr: number | null;
    bbUpper: number | null;
    bbMiddle: number | null;
    bbLower: number | null;
    bbPercentB: number | null;

    // Volume
    volume: number;
    volumeAvg: number | null;
    volumeRatio: number | null;

    // Levels
    vwap: number | null;
    nearestSupport: number | null;
    nearestResistance: number | null;

    // Advanced
    adx: number | null;
    adxTrend: 'up' | 'down' | 'ranging' | null;
    ichimokuSignal: 'bullish' | 'bearish' | 'neutral' | null;
}

/**
 * Strategy interface - all strategies must implement this
 */
export interface Strategy {
    name: string;
    description: string;

    /**
     * Analyze indicators and return a signal
     */
    analyze(indicators: IndicatorSnapshot): StrategySignal;

    /**
     * Check if this strategy is suitable for current conditions
     */
    isApplicable(indicators: IndicatorSnapshot): boolean;
}

/**
 * Ranked candidate from combining multiple strategies
 */
export interface RankedCandidate {
    symbol: string;
    direction: Direction;
    overallScore: number;      // 0-100
    confidence: number;        // 0-1
    strategies: {
        name: string;
        signal: StrategySignal;
    }[];
    topReasons: string[];      // Combined from all strategies
    invalidation: number | null;
    suggestedEntry: number;
    suggestedStop: number | null;
    suggestedTarget: number | null;
}

/**
 * Helper to create a neutral (no trade) signal
 */
export function noSignal(reason: string = 'No clear setup'): StrategySignal {
    return {
        direction: 'none',
        score: 0,
        confidence: 0,
        reasons: [reason],
        invalidation: null,
    };
}
