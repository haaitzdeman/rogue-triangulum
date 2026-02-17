/**
 * Options Desk Brain — Public API
 *
 * DO NOT change external response shapes or route paths.
 *
 * Re-exports all public modules from the options desk.
 * Existing imports via @/lib/options/* continue to work unchanged.
 * New code SHOULD import from @/lib/brains/options instead.
 */

// Types
export type {
    OptionContract,
    LiquidityConfig,
    StrategySuggestion,
    Strategy,
    RecommendedContract,
    SpreadLegs,
    RecommendedTrade,
    IVRankResult,
    ExpectedMoveResult,
    OptionScanCandidate,
    OptionScanResponse,
} from '@/lib/options/options-types';

export { DEFAULT_LIQUIDITY_CONFIG } from '@/lib/options/options-types';

// Service
export {
    scanOptions,
    listCachedScans,
} from '@/lib/options/options-service';

// Decision Layer
export { selectStrategy } from '@/lib/options/options-decision-layer';

export type {
    DecisionResult,
} from '@/lib/options/options-decision-layer';

// Contract Selector
export { selectContract } from '@/lib/options/contract-selector';

// IV Utils
export {
    computeIVRank,
    classifyIVRank,
    formatIVRank,
} from '@/lib/options/iv-utils';

// Expected Move
export {
    computeExpectedMove,
    formatExpectedMove,
} from '@/lib/options/expected-move';

// Chain Provider
export {
    filterByLiquidity,
    computeLiquidityScore,
} from '@/lib/options/options-chain-provider';

// Signal Utils
export {
    generateOptionsSignalId,
} from '@/lib/options/signal-utils';
