/**
 * Premarket Gap Scanner
 * 
 * Rule-based scanner for premarket gaps with configurable filters.
 * 
 * TERMINOLOGY: "Scanner", "Filter", "Rule-based"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import type {
    GapScannerConfig,
    GapData,
    DataMode,
} from './premarket-types';
import { DEFAULT_GAP_SCANNER_CONFIG } from './premarket-types';

// Known ETF symbols to exclude if configured
const ETF_SYMBOLS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY',
    'XLP', 'XLU', 'XLB', 'XLRE', 'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF',
    'HYG', 'LQD', 'VXX', 'UVXY', 'SQQQ', 'TQQQ', 'SPXU', 'SPXL', 'EEM', 'EFA',
]);

/**
 * Compute gap percentage
 */
export function computeGapPct(prevClose: number, currentPrice: number): number {
    if (prevClose === 0) return 0;
    return ((currentPrice - prevClose) / prevClose) * 100;
}

/**
 * Determine gap direction
 */
export function getGapDirection(gapPct: number): 'UP' | 'DOWN' {
    return gapPct >= 0 ? 'UP' : 'DOWN';
}

/**
 * Check if symbol is an ETF
 */
export function isETF(symbol: string): boolean {
    return ETF_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Apply filters to gap data
 */
export function filterGapData(
    gapData: GapData,
    config: GapScannerConfig = DEFAULT_GAP_SCANNER_CONFIG
): boolean {
    // Filter by minimum absolute gap
    if (Math.abs(gapData.gapPct) < config.minAbsGapPct) {
        return false;
    }

    // Filter by minimum price
    if (gapData.currentPrice < config.minPrice) {
        return false;
    }

    // Filter by minimum average daily volume
    if (gapData.avgDailyVolume20 < config.minAvgDailyVolume20) {
        return false;
    }

    // Filter ETFs if configured
    if (config.excludeETFs && isETF(gapData.symbol)) {
        return false;
    }

    return true;
}

/**
 * Sort candidates by absolute gap percentage (desc), then by volume (desc)
 */
export function sortGapCandidates(candidates: GapData[]): GapData[] {
    return [...candidates].sort((a, b) => {
        // Primary: absolute gap % descending
        const absGapDiff = Math.abs(b.gapPct) - Math.abs(a.gapPct);
        if (absGapDiff !== 0) return absGapDiff;

        // Secondary: volume descending
        return b.avgDailyVolume20 - a.avgDailyVolume20;
    });
}

/**
 * Build gap data from raw inputs
 */
export function buildGapData(
    symbol: string,
    prevClose: number,
    gapReferencePrice: number,
    avgDailyVolume20: number,
    dataMode: DataMode,
    premarketVolume?: number,
    premarketHigh?: number,
    premarketLow?: number
): GapData {
    const gapPct = computeGapPct(prevClose, gapReferencePrice);

    return {
        symbol: symbol.toUpperCase(),
        prevClose,
        gapReferencePrice,
        gapPct: Math.round(gapPct * 100) / 100, // Round to 2 decimals
        avgDailyVolume20,
        currentPrice: gapReferencePrice,
        dataMode,
        premarketVolume,
        premarketHigh,
        premarketLow,
    };
}

/**
 * Main scanner function: filter and sort gap candidates
 */
export function scanGaps(
    allGapData: GapData[],
    config: GapScannerConfig = DEFAULT_GAP_SCANNER_CONFIG
): GapData[] {
    // Apply filters
    const filtered = allGapData.filter(gd => filterGapData(gd, config));

    // Sort by |gapPct| desc, then volume desc
    return sortGapCandidates(filtered);
}
