/**
 * Premarket Desk Brain — Public API
 *
 * DO NOT change external response shapes or route paths.
 *
 * Re-exports all public modules from the premarket desk.
 * Existing imports via @/lib/premarket/* continue to work unchanged.
 * New code SHOULD import from @/lib/brains/premarket instead.
 */

// Types
export type {
    GapScannerConfig,
    AnalogConfig,
    DataMode,
    RegimeTag,
    PlayType,
    ConfidenceLevel,
    KeyLevels,
    AnalogStats,
    GapData,
    AnalogDay,
    GapCandidate,
    ResolvedDateInfo,
    PremarketScanResult,
    PremarketQuote,
    LivePremarketSnapshot,
    HistoricalBar,
} from '@/lib/premarket/premarket-types';

export {
    DEFAULT_GAP_SCANNER_CONFIG,
    DEFAULT_ANALOG_CONFIG,
} from '@/lib/premarket/premarket-types';

// Service
export {
    runPremarketScan,
    getCachedPremarketScan,
    listCachedScanDates,
} from '@/lib/premarket/premarket-service';

// Decision Layer
export { buildGapCandidate } from '@/lib/premarket/decision-layer';

// Gap Scanner
export { buildGapData, scanGaps, getGapDirection } from '@/lib/premarket/gap-scanner';

// Analog Engine
export { analyzeAnalogs } from '@/lib/premarket/analog-engine';

// Date Resolver
export {
    resolvePremarketDate,
    isDateOutOfRangeError,
    getDatasetRange,
    isLiveProviderConfigured,
    isLiveCoverageSufficient,
    isTradingDay,
    MIN_COVERAGE_COUNT,
    MIN_COVERAGE_PERCENT,
} from '@/lib/premarket/date-resolver';

export type {
    DatasetRange,
    PremarketMode,
    DateResolution,
    DateResolveOptions,
    DateOutOfRangeError,
} from '@/lib/premarket/date-resolver';

// Signal Utils
export {
    generateSignalId,
    validateOutcomeUpdate,
    calculateOutcome,
    extractRiskPerShare,
} from '@/lib/premarket/signal-utils';

// Provider
export {
    getPremarketUniverse,
    getPrevClose,
    getPremarketQuote,
    getAvgDailyVolume20,
    getHistoricalBars,
    hasDataset,
    isLivePremarketAvailable,
    getLivePremarketSnapshot,
    getProviderDiagnostics,
    diagnoseSymbol,
    getEffectiveProvider,
    getEffectiveBaseUrl,
    getPolygonDiagnostics,
} from '@/lib/premarket/provider';

export type {
    ProviderDiagnostics,
    SymbolDiagnostic,
    ProviderError,
} from '@/lib/premarket/provider';

// Live Provider
export {
    isPremarketHours,
    isMarketHours,
    fetchPolygonSnapshot,
    fetchPolygonSnapshots,
    fetchPolygonSnapshotDetailed,
    getLiveProviderDiagnostics,
} from '@/lib/premarket/polygon-live-provider';

export type {
    PolygonSnapshot,
    PolygonSnapshotDetailed,
    LiveProviderDiagnostics,
    LivePriceSource,
} from '@/lib/premarket/polygon-live-provider';
