/**
 * Premarket Date Resolver
 * 
 * Resolves scan dates based on dataset availability and live provider status.
 * Supports DATASET_REPLAY and LIVE_PREMARKET modes.
 * 
 * KEY BEHAVIOR:
 * - Default (no preferLive) → DATASET_REPLAY with dataset's lastDate
 * - preferLive=true → Only use LIVE_PREMARKET if coverage is sufficient
 */

import * as fs from 'fs';

const MANIFEST_PATH = 'data/datasets/manifest.json';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Minimum coverage threshold for live premarket mode
 * Must have at least MIN_COVERAGE_COUNT symbols OR MIN_COVERAGE_PERCENT of universe
 */
export const MIN_COVERAGE_COUNT = 5;
export const MIN_COVERAGE_PERCENT = 0.1; // 10%

// =============================================================================
// Types
// =============================================================================

export interface DatasetRange {
    firstDate: string; // YYYY-MM-DD
    lastDate: string;  // YYYY-MM-DD
}

export type PremarketMode = 'DATASET_REPLAY' | 'LIVE_PREMARKET';

export interface DateResolution {
    requestedDate: string | null;
    effectiveDate: string;
    datasetRange: DatasetRange;
    mode: PremarketMode;
    reason: string;
    liveCoverageInsufficient?: boolean;
}

export interface DateResolveOptions {
    requestedDate?: string;
    clamp?: boolean;
    preferLive?: boolean;
    liveCoverageCount?: number; // Used when checking live coverage
    universeCount?: number;     // Total universe size for percentage calc
}

export interface DateOutOfRangeError {
    errorCode: 'DATE_OUT_OF_RANGE';
    datasetRange: DatasetRange;
    requestedDate: string;
    suggestion: string;
}

// =============================================================================
// Manifest Loading
// =============================================================================

interface ManifestSymbol {
    symbol: string;
    startDate: string;
    endDate: string;
    isValid: boolean;
}

interface Manifest {
    schemaVersion: string;
    symbols: ManifestSymbol[];
}

let cachedManifest: Manifest | null = null;

function loadManifest(): Manifest {
    if (cachedManifest) return cachedManifest;

    try {
        const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
        cachedManifest = JSON.parse(content) as Manifest;
        return cachedManifest;
    } catch (err) {
        console.error('[DateResolver] Failed to load manifest:', err);
        // Return empty manifest on error
        return { schemaVersion: '1.0', symbols: [] };
    }
}

// =============================================================================
// Dataset Range
// =============================================================================

/**
 * Get dataset date range from manifest (not by scanning files)
 */
export function getDatasetRange(): DatasetRange {
    const manifest = loadManifest();

    if (manifest.symbols.length === 0) {
        // No symbols - return empty range
        const today = new Date().toISOString().slice(0, 10);
        return { firstDate: today, lastDate: today };
    }

    // Find min start date and max end date across all valid symbols
    let minStart = manifest.symbols[0].startDate;
    let maxEnd = manifest.symbols[0].endDate;

    for (const symbol of manifest.symbols) {
        if (symbol.startDate < minStart) minStart = symbol.startDate;
        if (symbol.endDate > maxEnd) maxEnd = symbol.endDate;
    }

    return {
        firstDate: minStart,
        lastDate: maxEnd,
    };
}

// =============================================================================
// Live Provider Check
// =============================================================================

/**
 * Check if a live premarket provider is configured
 */
export function isLiveProviderConfigured(): boolean {
    // Check for known live provider API keys
    const hasMassive = !!process.env.MASSIVE_API_KEY;
    const hasPolygon = !!process.env.POLYGON_API_KEY;
    // Add more providers as needed

    return hasMassive || hasPolygon;
}

/**
 * Check if a date is a US trading day (simplified check)
 * NOTE: This is a basic check - doesn't account for holidays
 */
export function isTradingDay(date: Date): boolean {
    const day = date.getDay();
    // 0 = Sunday, 6 = Saturday
    return day !== 0 && day !== 6;
}

/**
 * Check if live coverage meets minimum threshold
 */
export function isLiveCoverageSufficient(
    coverageCount: number,
    universeCount: number
): boolean {
    // Must have at least MIN_COVERAGE_COUNT OR MIN_COVERAGE_PERCENT of universe
    const minByPercent = Math.ceil(universeCount * MIN_COVERAGE_PERCENT);
    return coverageCount >= MIN_COVERAGE_COUNT || coverageCount >= minByPercent;
}

// =============================================================================
// Date Resolution
// =============================================================================

/**
 * Resolve premarket scan date based on options and dataset availability
 * 
 * KEY BEHAVIOR:
 * 1. If date is omitted AND preferLive is false (default):
 *    → DATASET_REPLAY with datasetRange.lastDate
 * 
 * 2. If date is omitted AND preferLive=true AND live coverage is sufficient:
 *    → LIVE_PREMARKET with today
 * 
 * 3. If date is omitted AND preferLive=true BUT coverage insufficient:
 *    → DATASET_REPLAY with datasetRange.lastDate (fallback with reason)
 * 
 * 4. If date is provided:
 *    → DATASET_REPLAY if within range, error or clamp if outside
 */
export function resolvePremarketDate(
    options: DateResolveOptions = {}
): DateResolution | DateOutOfRangeError {
    const {
        requestedDate,
        clamp = false,
        preferLive = false, // DEFAULT TO FALSE - DATASET_REPLAY is the default!
        liveCoverageCount = 0,
        universeCount = 48,
    } = options;

    const datasetRange = getDatasetRange();
    const today = new Date().toISOString().slice(0, 10);
    const todayDate = new Date();

    // Case 1: No date requested
    if (!requestedDate) {
        // Only try live mode if explicitly requested
        if (preferLive) {
            const liveConfigured = isLiveProviderConfigured();
            const isWeekday = isTradingDay(todayDate);
            const coverageSufficient = isLiveCoverageSufficient(liveCoverageCount, universeCount);

            if (liveConfigured && isWeekday && coverageSufficient) {
                return {
                    requestedDate: null,
                    effectiveDate: today,
                    datasetRange,
                    mode: 'LIVE_PREMARKET',
                    reason: `preferLive=true; live provider configured, ${liveCoverageCount}/${universeCount} symbols have premarket data`,
                };
            }

            // Live was requested but not available or insufficient coverage
            if (!liveConfigured) {
                return {
                    requestedDate: null,
                    effectiveDate: datasetRange.lastDate,
                    datasetRange,
                    mode: 'DATASET_REPLAY',
                    reason: `preferLive=true but no live provider configured; falling back to dataset (${datasetRange.lastDate})`,
                    liveCoverageInsufficient: true,
                };
            }

            if (!isWeekday) {
                return {
                    requestedDate: null,
                    effectiveDate: datasetRange.lastDate,
                    datasetRange,
                    mode: 'DATASET_REPLAY',
                    reason: `preferLive=true but today is not a trading day; falling back to dataset (${datasetRange.lastDate})`,
                    liveCoverageInsufficient: true,
                };
            }

            if (!coverageSufficient) {
                return {
                    requestedDate: null,
                    effectiveDate: datasetRange.lastDate,
                    datasetRange,
                    mode: 'DATASET_REPLAY',
                    reason: `preferLive=true but coverage insufficient (${liveCoverageCount}/${universeCount} symbols, need ${MIN_COVERAGE_COUNT} or ${Math.ceil(universeCount * MIN_COVERAGE_PERCENT)}); falling back to dataset`,
                    liveCoverageInsufficient: true,
                };
            }
        }

        // Default behavior: DATASET_REPLAY with lastDate
        return {
            requestedDate: null,
            effectiveDate: datasetRange.lastDate,
            datasetRange,
            mode: 'DATASET_REPLAY',
            reason: `No date specified; using dataset's last available date (${datasetRange.lastDate})`,
        };
    }

    // Case 2: Date requested
    const isWithinRange =
        requestedDate >= datasetRange.firstDate &&
        requestedDate <= datasetRange.lastDate;

    if (isWithinRange) {
        return {
            requestedDate,
            effectiveDate: requestedDate,
            datasetRange,
            mode: 'DATASET_REPLAY',
            reason: `Requested date ${requestedDate} is within dataset range`,
        };
    }

    // Date is outside range
    if (!clamp) {
        // Return error object
        return {
            errorCode: 'DATE_OUT_OF_RANGE',
            datasetRange,
            requestedDate,
            suggestion: datasetRange.lastDate,
        };
    }

    // Clamp to nearest boundary
    let effectiveDate: string;
    let reason: string;

    if (requestedDate < datasetRange.firstDate) {
        effectiveDate = datasetRange.firstDate;
        reason = `Requested date ${requestedDate} is before dataset start; clamped to ${effectiveDate}`;
    } else {
        effectiveDate = datasetRange.lastDate;
        reason = `Requested date ${requestedDate} is after dataset end; clamped to ${effectiveDate}`;
    }

    return {
        requestedDate,
        effectiveDate,
        datasetRange,
        mode: 'DATASET_REPLAY',
        reason,
    };
}

/**
 * Type guard to check if result is an error
 */
export function isDateOutOfRangeError(
    result: DateResolution | DateOutOfRangeError
): result is DateOutOfRangeError {
    return 'errorCode' in result && result.errorCode === 'DATE_OUT_OF_RANGE';
}
