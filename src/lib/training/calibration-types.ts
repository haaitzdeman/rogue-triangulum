/**
 * Calibration System Types
 * 
 * Core types for walk-forward calibration and performance-based adjustment.
 * 
 * TERMINOLOGY: "Calibration", "Evaluation", "Walk-Forward Backtest"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Default universe for calibration (configurable)
 */
export const DEFAULT_UNIVERSE = [
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD',
    'NFLX', 'SPY', 'QQQ', 'IWM', 'DIA', 'JPM', 'BAC', 'XOM',
    'CVX', 'UNH', 'COST', 'ADBE',
];

/**
 * Walk-forward configuration (configurable)
 */
export interface WalkForwardConfig {
    trainWindowMonths: number;    // Default: 24 (2 years)
    testWindowMonths: number;     // Default: 6
    stepMonths: number;           // Default: 6 (roll every 6 months)
    minBarsRequired: number;      // Minimum bars for valid analysis
}

export const DEFAULT_WALKFORWARD_CONFIG: WalkForwardConfig = {
    trainWindowMonths: 24,
    testWindowMonths: 6,
    stepMonths: 6,
    minBarsRequired: 200,
};

/**
 * Safety thresholds for calibration
 */
export const SAFETY_THRESHOLDS = {
    MIN_SAMPLE_SIZE_PER_BUCKET: 200,  // Factor = 1.0 if below
    MAX_PROFILE_AGE_DAYS: 30,         // Stale warning if older
    REQUIRE_IMPROVEMENT: true,         // Only apply if calibrated > base
};

/**
 * Data quality thresholds
 */
export const DATA_QUALITY_THRESHOLDS = {
    MIN_COMPLETENESS_PERCENT: 95,    // Skip symbols below this
    MAX_GAP_DAYS: 5,                  // Flag gaps > 5 trading days
    MIN_BARS_FOR_CALIBRATION: 200,   // Need at least 200 bars
};

/**
 * Calibration status for UI
 */
export type CalibrationStatus = 'ON' | 'OFF' | 'STALE';

/**
 * OHLCV Bar (unified across providers)
 */
export interface OHLCVBar {
    timestamp: number;    // Unix timestamp (ms)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Dataset manifest - tracks downloaded data
 */
export interface DatasetManifest {
    schemaVersion: '1.0';
    createdAt: string;
    lastUpdated: string;
    dataLimited?: boolean;  // True if plan returned less data than requested
    symbols: DatasetSymbolInfo[];
    config: {
        universe: string[];
        startDate: string;
        endDate: string;
    };
}

export interface DatasetSymbolInfo {
    symbol: string;
    barCount: number;
    startDate: string;
    endDate: string;
    completenessPercent: number;
    gaps: { from: string; to: string; days: number }[];
    isValid: boolean;    // Above threshold
    planLimited?: boolean;  // True if data was less than requested
}

/**
 * Benchmark comparison result
 */
export interface BenchmarkComparison {
    winRate_base: number;
    winRate_calibrated: number;
    avgReturn_base: number;
    avgReturn_calibrated: number;
    sampleSize: number;
    calibrationApplied: boolean;  // Only true if calibrated > base
    reason?: string;
}

/**
 * Calibration Profile - output of walk-forward calibration
 */
export interface CalibrationProfile {
    schemaVersion: '1.0';
    createdAt: string;
    lastUpdated: string;
    dataLimited?: boolean;  // True if plan returned less history

    // Walk-forward metadata
    walkForwardConfig: WalkForwardConfig;
    dataRange: {
        start: string;
        end: string;
        symbolCount: number;
        totalSignals: number;
    };

    // Benchmark comparison
    benchmark?: BenchmarkComparison;

    // Per-strategy weights by regime
    strategyWeights: {
        [strategyName: string]: {
            [regime: string]: number;  // Multiplier 0-2
        };
    };

    // Score-to-probability calibration curve
    calibrationCurve: CalibrationBucket[];

    // Parameter calibration per strategy
    parameterOverrides: {
        [strategyName: string]: StrategyParams;
    };

    // Performance summary
    summary: {
        totalTrades: number;
        winRate: number;
        avgReturn: number;
        sharpeRatio: number;
        maxDrawdown: number;
    };
}

export interface CalibrationBucket {
    scoreBucketMin: number;   // e.g., 70
    scoreBucketMax: number;   // e.g., 79
    winRate: number;          // 0-1
    avgReturn: number;        // Percent
    sampleSize: number;
    confidenceFactor: number; // Derived multiplier (1.0 if sampleSize < threshold)
}

export interface StrategyParams {
    rsiOversold?: number;
    rsiOverbought?: number;
    atrMultiplier?: number;
    holdDays?: number;
    targetR?: number;
}

/**
 * Walk-forward step result
 */
export interface WalkForwardStep {
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;

    // Metrics from test period
    metrics: {
        strategyName: string;
        regime: string;
        signalCount: number;
        winRate: number;
        avgReturn: number;
        sharpeRatio: number;
    }[];

    // Calibration data
    scoreBuckets: {
        bucket: number;
        signalCount: number;
        winRate: number;
        avgReturn: number;
    }[];
}

/**
 * Ranked candidate with calibration explanation
 */
export interface CalibratedCandidate {
    symbol: string;
    baseScore: number;           // From strategy
    strategyName: string;
    regime: string;

    // Calibration applied
    strategyWeight: number;      // From profile
    calibrationFactor: number;   // From score bucket
    finalScore: number;          // baseScore * strategyWeight * calibrationFactor

    // Explanation for UI
    explanation: {
        baseScoreReason: string;
        weightReason: string;
        calibrationReason: string;
        finalScoreReason: string;
    };
}

/**
 * Training config from file
 */
export interface TrainingConfig {
    universe: string[];
    walkForward: WalkForwardConfig;
    safety: {
        minSampleSizePerBucket: number;
        maxProfileAgeDays: number;
        requireCalibrationImprovement: boolean;
    };
    scaling: {
        phase: 'A' | 'B' | 'C';
    };
}

/**
 * Load training config from file or env
 * 
 * Priority:
 * 1. TRAIN_UNIVERSE env var
 * 2. data/universe/tickers.txt (if universeSource=file in config)
 * 3. Default universe
 * 
 * symbolCount in config limits how many tickers are used
 */
export function loadTrainingConfig(): { universe: string[]; config: WalkForwardConfig } {
    // Check env first
    const envUniverse = process.env.TRAIN_UNIVERSE;
    if (envUniverse) {
        const symbols = envUniverse.split(',').map(s => s.trim().toUpperCase());
        console.log(`[Config] Universe from env: ${symbols.length} symbols`);
        return { universe: symbols, config: DEFAULT_WALKFORWARD_CONFIG };
    }

    // Try config file
    const configPath = path.join(process.cwd(), 'data/config/training.json');
    if (fs.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const wfConfig = data.walkForward || DEFAULT_WALKFORWARD_CONFIG;

            // Get symbolCount limit (phase-based or explicit)
            let symbolCount = data.symbolCount || 20;
            if (data.scaling?.phase && data.scaling?.phaseSymbolCounts) {
                symbolCount = data.scaling.phaseSymbolCounts[data.scaling.phase] || symbolCount;
            }

            // Load universe from file if specified
            let universe: string[] = DEFAULT_UNIVERSE;
            if (data.universeSource === 'file' && data.universeFile) {
                const tickersPath = path.join(process.cwd(), data.universeFile);
                if (fs.existsSync(tickersPath)) {
                    const content = fs.readFileSync(tickersPath, 'utf8');
                    const allTickers = content.split('\n')
                        .map(line => line.trim().toUpperCase())
                        .filter(line => line.length > 0 && !line.startsWith('#'));
                    universe = allTickers.slice(0, symbolCount);
                    console.log(`[Config] Loaded ${universe.length}/${allTickers.length} symbols from ${data.universeFile} (symbolCount=${symbolCount})`);
                } else {
                    console.warn(`[Config] Tickers file not found: ${tickersPath}, using defaults`);
                    universe = DEFAULT_UNIVERSE.slice(0, symbolCount);
                }
            } else if (data.universe && Array.isArray(data.universe)) {
                universe = data.universe.slice(0, symbolCount);
                console.log(`[Config] Loaded ${universe.length} symbols from training.json (symbolCount=${symbolCount})`);
            }

            return { universe, config: wfConfig };
        } catch {
            console.warn('[Config] Error loading training.json, using defaults');
        }
    }

    console.log(`[Config] Using default universe: ${DEFAULT_UNIVERSE.length} symbols`);
    return { universe: DEFAULT_UNIVERSE, config: DEFAULT_WALKFORWARD_CONFIG };
}

/**
 * Default empty profile (fallback)
 */
export const EMPTY_CALIBRATION_PROFILE: CalibrationProfile = {
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    walkForwardConfig: DEFAULT_WALKFORWARD_CONFIG,
    dataRange: {
        start: '',
        end: '',
        symbolCount: 0,
        totalSignals: 0,
    },
    benchmark: {
        winRate_base: 0,
        winRate_calibrated: 0,
        avgReturn_base: 0,
        avgReturn_calibrated: 0,
        sampleSize: 0,
        calibrationApplied: false,
        reason: 'No calibration profile',
    },
    strategyWeights: {},
    calibrationCurve: [],
    parameterOverrides: {},
    summary: {
        totalTrades: 0,
        winRate: 0,
        avgReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
    },
};

