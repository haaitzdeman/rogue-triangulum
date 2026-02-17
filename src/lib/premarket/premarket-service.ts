/**
 * Premarket Service
 * 
 * Orchestrates the full premarket gap scan workflow.
 * Caches results to disk for daily lookups.
 * 
 * TERMINOLOGY: "Service", "Orchestration", "Cache"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
    GapScannerConfig,
    AnalogConfig,
    GapData,
    GapCandidate,
    PremarketScanResult,
} from './premarket-types';
import { DEFAULT_GAP_SCANNER_CONFIG, DEFAULT_ANALOG_CONFIG } from './premarket-types';
import { buildGapData, scanGaps, getGapDirection } from './gap-scanner';
import { analyzeAnalogs } from './analog-engine';
import { buildGapCandidate } from './decision-layer';
import {
    getPremarketUniverse,
    getPrevClose,
    getPremarketQuote,
    getAvgDailyVolume20,
    getHistoricalBars,
    hasDataset,
} from './provider';

const PREMARKET_DIR = 'data/premarket';

/**
 * Ensure premarket directory exists
 */
function ensurePremarketDir(): void {
    if (!fs.existsSync(PREMARKET_DIR)) {
        fs.mkdirSync(PREMARKET_DIR, { recursive: true });
    }
}

/**
 * Get cache file path for a date
 */
function getCacheFilePath(date: Date): string {
    const dateStr = date.toISOString().slice(0, 10);
    return path.join(PREMARKET_DIR, `${dateStr}.json`);
}

/**
 * Load cached scan result if exists
 */
function loadCachedResult(date: Date): PremarketScanResult | null {
    const filePath = getCacheFilePath(date);
    if (!fs.existsSync(filePath)) return null;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as PremarketScanResult;
    } catch {
        return null;
    }
}

/**
 * Save scan result to cache
 */
function saveCachedResult(result: PremarketScanResult): void {
    ensurePremarketDir();
    const filePath = path.join(PREMARKET_DIR, `${result.date}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
}

/**
 * Input coverage metrics
 */
interface InputCoverage {
    symbolsWithPrevClose: number;
    symbolsWithOpen: number;
    symbolsWithPremarketPrice: number;
}

/**
 * Build raw gap data for all universe symbols
 */
function buildAllGapData(
    universe: string[],
    date: Date
): { gapData: GapData[]; skippedCount: number; inputCoverage: InputCoverage } {
    const gapData: GapData[] = [];
    let skippedCount = 0;

    // Track input coverage (count all symbols, not just filtered)
    let symbolsWithPrevClose = 0;
    let symbolsWithOpen = 0;
    let symbolsWithPremarketPrice = 0;

    for (const symbol of universe) {
        // Skip symbols without dataset
        if (!hasDataset(symbol)) {
            skippedCount++;
            continue;
        }

        // Get prices
        const prevClose = getPrevClose(symbol, date);
        if (prevClose !== null) {
            symbolsWithPrevClose++;
        } else {
            skippedCount++;
            continue;
        }

        const quote = getPremarketQuote(symbol, date);
        if (quote !== null) {
            symbolsWithOpen++;
            if (quote.dataMode === 'PREMARKET') {
                symbolsWithPremarketPrice++;
            }
        } else {
            skippedCount++;
            continue;
        }

        const avgVolume = getAvgDailyVolume20(symbol, date);

        // Build gap data
        const data = buildGapData(
            symbol,
            prevClose,
            quote.price,
            avgVolume,
            quote.dataMode,
            quote.volume,
            quote.high,
            quote.low
        );

        gapData.push(data);
    }

    return {
        gapData,
        skippedCount,
        inputCoverage: {
            symbolsWithPrevClose,
            symbolsWithOpen,
            symbolsWithPremarketPrice,
        },
    };
}

/**
 * Process a single gap candidate through analog analysis
 */
function processCandidate(
    gapData: GapData,
    date: Date,
    analogConfig: AnalogConfig
): GapCandidate {
    // Get historical bars for analog analysis
    const bars = getHistoricalBars(gapData.symbol, date);

    // Analyze analogs
    const direction = getGapDirection(gapData.gapPct);
    const { stats, lowConfidence } = analyzeAnalogs(
        bars,
        gapData.gapPct,
        direction,
        analogConfig
    );

    // Build candidate with decision
    return buildGapCandidate(gapData, stats, lowConfidence);
}
/**
 * Run premarket scan for a given date
 */
export function runPremarketScan(
    date?: Date,
    options: {
        force?: boolean;
        scannerConfig?: Partial<GapScannerConfig>;
        analogConfig?: Partial<AnalogConfig>;
        resolved?: {
            requestedDate: string | null;
            effectiveDate: string;
            mode: 'DATASET_REPLAY' | 'LIVE_PREMARKET';
            reason: string;
            datasetRange: { firstDate: string; lastDate: string };
        };
    } = {}
): PremarketScanResult {
    const scanDate = date || new Date();
    const dateStr = scanDate.toISOString().slice(0, 10);

    // Check cache unless force refresh
    if (!options.force) {
        const cached = loadCachedResult(scanDate);
        if (cached) {
            console.log(`[Premarket] Loaded cached result for ${dateStr}`);
            return cached;
        }
    }

    console.log(`[Premarket] Running scan for ${dateStr}...`);

    // Get universe
    const universe = getPremarketUniverse();
    console.log(`[Premarket] Universe: ${universe.length} symbols`);

    // Build configs
    const scannerConfig: GapScannerConfig = {
        ...DEFAULT_GAP_SCANNER_CONFIG,
        ...options.scannerConfig,
    };
    const analogConfig: AnalogConfig = {
        ...DEFAULT_ANALOG_CONFIG,
        ...options.analogConfig,
    };

    // Build raw gap data
    const { gapData, skippedCount, inputCoverage } = buildAllGapData(universe, scanDate);
    console.log(`[Premarket] Built gap data for ${gapData.length} symbols (${skippedCount} skipped)`);

    // Apply filters and sort
    const filteredGaps = scanGaps(gapData, scannerConfig);
    console.log(`[Premarket] After filters: ${filteredGaps.length} candidates`);

    // Process each candidate through analog analysis
    const candidates: GapCandidate[] = [];
    for (const gap of filteredGaps) {
        const candidate = processCandidate(gap, scanDate, analogConfig);
        candidates.push(candidate);
    }

    // Count data modes
    const dataModeSummary = {
        PREMARKET: candidates.filter(c => c.dataMode === 'PREMARKET').length,
        OPEN_FALLBACK: candidates.filter(c => c.dataMode === 'OPEN_FALLBACK').length,
    };

    // Default resolved info if not provided
    const resolved = options.resolved ?? {
        requestedDate: dateStr,
        effectiveDate: dateStr,
        mode: 'DATASET_REPLAY' as const,
        reason: 'Direct date parameter provided',
        datasetRange: { firstDate: dateStr, lastDate: dateStr },
    };

    // Build result
    const result: PremarketScanResult = {
        date: dateStr,
        universeCount: universe.length,
        candidateCount: candidates.length,
        resolved,
        dataModeSummary,
        inputCoverageSummary: inputCoverage,
        candidates,
        generatedAt: new Date().toISOString(),
    };

    // Cache result
    saveCachedResult(result);
    console.log(`[Premarket] Saved result to ${getCacheFilePath(scanDate)}`);

    return result;
}

/**
 * Get cached scan result for a date (no new scan)
 */
export function getCachedPremarketScan(date: Date): PremarketScanResult | null {
    return loadCachedResult(date);
}

/**
 * List available cached scan dates
 */
export function listCachedScanDates(): string[] {
    ensurePremarketDir();
    const files = fs.readdirSync(PREMARKET_DIR);
    return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .sort()
        .reverse();
}
