/**
 * Premarket Gap Signal System - Types
 * 
 * Rule-based + statistical analog evaluation for gap analysis.
 * 
 * TERMINOLOGY: "Analog", "Statistical", "Rule-based", "Evaluation"
 * NOT: "Training", "Learning", "AI", "ML", "Neural"
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Gap Scanner Configuration
 */
export interface GapScannerConfig {
    minAbsGapPct: number;        // Minimum absolute gap % (default: 3.0)
    minPrice: number;            // Minimum stock price (default: 3)
    minAvgDailyVolume20: number; // Minimum 20-day avg volume (default: 1000000)
    excludeETFs: boolean;        // Whether to exclude ETFs (default: false)
}

export const DEFAULT_GAP_SCANNER_CONFIG: GapScannerConfig = {
    minAbsGapPct: 3.0,
    minPrice: 3,
    minAvgDailyVolume20: 1000000,
    excludeETFs: false,
};

/**
 * Analog Engine Configuration
 */
export interface AnalogConfig {
    gapBandPct: number;     // ±% band for matching analogs (default: 1.0)
    minSampleSize: number;  // Minimum samples for high confidence (default: 30)
    holdDays: number;       // Days to evaluate outcome (default: 1)
    rDefinition: number;    // R-multiple for hit rate calc (default: 1.0%)
}

export const DEFAULT_ANALOG_CONFIG: AnalogConfig = {
    gapBandPct: 1.0,
    minSampleSize: 30,
    holdDays: 1,
    rDefinition: 1.0, // 1% move = 1R
};

// =============================================================================
// Data Mode
// =============================================================================

/**
 * Data mode indicates whether true premarket data was available
 */
export type DataMode = 'PREMARKET' | 'OPEN_FALLBACK';

// =============================================================================
// Regime Types
// =============================================================================

/**
 * Market regime based on volatility
 */
export type RegimeTag = 'low_vol' | 'normal' | 'high_vol';

// =============================================================================
// Play Types
// =============================================================================

/**
 * Play type decision
 */
export type PlayType = 'CONTINUATION' | 'FADE' | 'AVOID';

/**
 * Confidence level
 */
export type ConfidenceLevel = 'HIGH' | 'LOW';

// =============================================================================
// Core Data Structures
// =============================================================================

/**
 * Key price levels for a candidate
 */
export interface KeyLevels {
    prevClose: number;
    gapReferencePrice: number;  // Premarket or open fallback
    premarketHigh?: number;
    premarketLow?: number;
    vwap?: number;
}

/**
 * Analog statistics from historical data
 */
export interface AnalogStats {
    sampleSize: number;
    hitRate: number;           // % of times +1R hit before -1R
    avgMFE: number;            // Average Maximum Favorable Excursion %
    avgMAE: number;            // Average Maximum Adverse Excursion %
    continuationPct: number;   // Average day return %
    regimeTag: RegimeTag;
}

/**
 * Raw gap data for a symbol
 */
export interface GapData {
    symbol: string;
    prevClose: number;
    gapReferencePrice: number; // Premarket price or open fallback
    gapPct: number;
    avgDailyVolume20: number;
    currentPrice: number;
    dataMode: DataMode;
    premarketVolume?: number;
    premarketHigh?: number;
    premarketLow?: number;
}

/**
 * Analog day found in historical data
 */
export interface AnalogDay {
    date: string;
    gapPct: number;
    direction: 'UP' | 'DOWN';
    regime: RegimeTag;
    dayReturn: number;        // Close-to-close %
    mfe: number;              // Open-to-high %
    mae: number;              // Open-to-low %
    hitPlusR: boolean;        // Did it hit +1R before -1R?
}

/**
 * Gap candidate with analysis
 */
export interface GapCandidate {
    symbol: string;
    gapPct: number;
    direction: 'UP' | 'DOWN';
    prevClose: number;
    gapReferencePrice: number;
    avgDailyVolume20: number;
    dataMode: DataMode;
    playType: PlayType;
    confidence: ConfidenceLevel;
    lowConfidence: boolean;
    because: string;
    keyLevels: KeyLevels;
    invalidation: string;
    riskNote: string;
    analogStats: AnalogStats;
}

/**
 * Resolved date info included in scan result
 */
export interface ResolvedDateInfo {
    requestedDate: string | null;
    effectiveDate: string;
    mode: 'DATASET_REPLAY' | 'LIVE_PREMARKET';
    reason: string;
    datasetRange: {
        firstDate: string;
        lastDate: string;
    };
}

/**
 * Full premarket scan result
 */
export interface PremarketScanResult {
    date: string;
    universeCount: number;
    candidateCount: number;
    resolved: ResolvedDateInfo;
    dataModeSummary: {
        PREMARKET: number;
        OPEN_FALLBACK: number;
    };
    inputCoverageSummary: {
        symbolsWithPrevClose: number;
        symbolsWithOpen: number;
        symbolsWithPremarketPrice: number;
    };
    candidates: GapCandidate[];
    generatedAt: string;
}

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Premarket quote data
 */
export interface PremarketQuote {
    price: number;
    volume?: number;
    high?: number;
    low?: number;
    dataMode: DataMode;
}

/**
 * Live premarket snapshot for a symbol
 */
export interface LivePremarketSnapshot {
    symbol: string;
    prevClose: number | null;
    premarketPrice: number | null;
    livePrice?: number | null;
    livePriceSource?: 'PREMARKET_TRADE' | 'DAY_OPEN' | 'PREV_CLOSE' | null;
    premarketVolume?: number;
    open?: number;
    dataMode: DataMode;
}

/**
 * Bar data for analog analysis
 */
export interface HistoricalBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

