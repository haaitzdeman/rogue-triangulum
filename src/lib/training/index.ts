/**
 * Training Module Index
 * 
 * Contains:
 * - Data providers (Polygon, Massive, Mock)
 * - Walk-forward calibration (NOT AI/ML - performance-based)
 * - Dataset builder
 * - Calibration loader
 */

export {
    getTrainingProvider,
    setTrainingProvider,
    MockTrainingProvider,
} from './provider-adapter';

export type {
    TrainingProvider,
    OHLCVBar,
    Timeframe,
    OptionChainItem,
    MarketEvent,
} from './provider-adapter';

// Polygon real data provider
export { PolygonTrainingProvider } from './polygon-provider';

// Massive Stocks Starter provider
export { MassiveProvider, getMassiveProvider } from './massive-provider';

// Calibration types
export type {
    CalibrationProfile,
    WalkForwardConfig,
    CalibrationBucket,
    DatasetManifest,
    DatasetSymbolInfo,
    CalibratedCandidate,
    StrategyParams,
    BenchmarkComparison,
    CalibrationStatus,
    TrainingConfig,
} from './calibration-types';

export {
    DEFAULT_UNIVERSE,
    DEFAULT_WALKFORWARD_CONFIG,
    DATA_QUALITY_THRESHOLDS,
    SAFETY_THRESHOLDS,
    EMPTY_CALIBRATION_PROFILE,
    loadTrainingConfig,
} from './calibration-types';

// Dataset builder
export {
    buildDataset,
    loadSymbolDataset,
    loadManifest,
    getValidSymbols,
} from './dataset-builder';

// Walk-forward calibration
export {
    runWalkForwardCalibration,
    loadCalibrationProfile,
    getCalibrationStatus,
} from './walkforward-trainer';

// Calibration loader (runtime)
export {
    getCalibrationProfile,
    getStrategyWeight,
    getCalibrationFactor,
    applyCalibrаtion,
    hasCalibrationProfile,
    clearProfileCache,
} from './calibration-loader';

