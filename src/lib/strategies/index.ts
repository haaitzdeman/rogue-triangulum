/**
 * Strategy Index
 * 
 * Exports all strategies and utility functions.
 * Phase A: Daily bars only.
 */

export type {
    Strategy,
    StrategySignal,
    IndicatorSnapshot,
    Direction,
    RankedCandidate,
} from './types';

export { noSignal } from './types';

// Individual strategies
export { MomentumStrategy } from './momentum';
export { BreakoutStrategy } from './breakout';
export { MeanReversionStrategy } from './meanReversion';
export { TrendFollowStrategy } from './trendFollow';

// All strategies as array for iteration
import { MomentumStrategy } from './momentum';
import { BreakoutStrategy } from './breakout';
import { MeanReversionStrategy } from './meanReversion';
import { TrendFollowStrategy } from './trendFollow';
import type { Strategy } from './types';

export const ALL_STRATEGIES: Strategy[] = [
    MomentumStrategy,
    BreakoutStrategy,
    MeanReversionStrategy,
    TrendFollowStrategy,
];

/**
 * Get strategies by name
 */
export function getStrategy(name: string): Strategy | undefined {
    return ALL_STRATEGIES.find(s => s.name.toLowerCase() === name.toLowerCase());
}
