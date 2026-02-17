/**
 * Dataset Builder
 * 
 * Pulls historical data from Massive provider for calibration.
 * Persists to /data/datasets/ with completeness stats per symbol.
 * 
 * Features:
 * - Gap detection
 * - Completeness scoring
 * - Skip symbols below quality threshold
 * - Manifest generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { getMassiveProvider } from './massive-provider';
import type { OHLCVBar } from './provider-adapter';
import type { DatasetManifest, DatasetSymbolInfo } from './calibration-types';
import { DEFAULT_UNIVERSE, DATA_QUALITY_THRESHOLDS } from './calibration-types';

const DATASETS_DIR = 'data/datasets';

/**
 * Ensure datasets directory exists
 */
function ensureDatasetDir(): void {
    if (!fs.existsSync(DATASETS_DIR)) {
        fs.mkdirSync(DATASETS_DIR, { recursive: true });
    }
}

/**
 * Detect gaps in daily bars
 */
function detectGaps(bars: OHLCVBar[]): { from: string; to: string; days: number }[] {
    const gaps: { from: string; to: string; days: number }[] = [];

    for (let i = 1; i < bars.length; i++) {
        const prev = new Date(bars[i - 1].timestamp);
        const curr = new Date(bars[i].timestamp);

        // Calculate trading days between (excluding weekends)
        const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

        // More than 3 calendar days = potential gap (accounting for weekends)
        if (daysDiff > 4) {
            const tradingDays = Math.floor(daysDiff * 5 / 7); // Rough estimate
            if (tradingDays > DATA_QUALITY_THRESHOLDS.MAX_GAP_DAYS) {
                gaps.push({
                    from: prev.toISOString().slice(0, 10),
                    to: curr.toISOString().slice(0, 10),
                    days: tradingDays,
                });
            }
        }
    }

    return gaps;
}

/**
 * Calculate completeness percentage
 */
function calculateCompleteness(bars: OHLCVBar[], startDate: Date, endDate: Date): number {
    if (bars.length === 0) return 0;

    // Expected trading days (rough: 252 per year)
    const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const expectedBars = Math.floor(years * 252);

    if (expectedBars === 0) return 0;

    return Math.min(100, (bars.length / expectedBars) * 100);
}

/**
 * Build dataset for a single symbol
 */
async function buildSymbolDataset(
    symbol: string,
    startDate: Date,
    endDate: Date
): Promise<DatasetSymbolInfo> {
    const provider = getMassiveProvider();

    console.log(`[DatasetBuilder] Fetching ${symbol}...`);
    const bars = await provider.getDailyBars(symbol, startDate, endDate);

    // Calculate stats
    const gaps = detectGaps(bars);
    const completeness = calculateCompleteness(bars, startDate, endDate);
    const isValid = completeness >= DATA_QUALITY_THRESHOLDS.MIN_COMPLETENESS_PERCENT &&
        bars.length >= DATA_QUALITY_THRESHOLDS.MIN_BARS_FOR_CALIBRATION;

    // Persist bars to file
    if (bars.length > 0) {
        ensureDatasetDir();
        const filePath = path.join(DATASETS_DIR, `${symbol}.json`);
        fs.writeFileSync(filePath, JSON.stringify({
            symbol,
            bars,
            metadata: {
                barCount: bars.length,
                startDate: bars.length > 0 ? new Date(bars[0].timestamp).toISOString() : null,
                endDate: bars.length > 0 ? new Date(bars[bars.length - 1].timestamp).toISOString() : null,
                fetchedAt: new Date().toISOString(),
            },
        }, null, 2));
    }

    const symbolInfo: DatasetSymbolInfo = {
        symbol,
        barCount: bars.length,
        startDate: bars.length > 0 ? new Date(bars[0].timestamp).toISOString().slice(0, 10) : '',
        endDate: bars.length > 0 ? new Date(bars[bars.length - 1].timestamp).toISOString().slice(0, 10) : '',
        completenessPercent: Math.round(completeness * 100) / 100,
        gaps,
        isValid,
    };

    console.log(`[DatasetBuilder] ${symbol}: ${bars.length} bars, ${completeness.toFixed(1)}% complete, valid=${isValid}`);

    return symbolInfo;
}

/**
 * Build full dataset for universe
 */
export async function buildDataset(options: {
    universe?: string[];
    yearsBack?: number;
} = {}): Promise<DatasetManifest> {
    const universe = options.universe || DEFAULT_UNIVERSE;
    const yearsBack = options.yearsBack || 5;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - yearsBack);

    console.log(`[DatasetBuilder] Building dataset for ${universe.length} symbols`);
    console.log(`[DatasetBuilder] Date range: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`);

    ensureDatasetDir();

    const symbols: DatasetSymbolInfo[] = [];

    for (const symbol of universe) {
        try {
            const info = await buildSymbolDataset(symbol, startDate, endDate);
            symbols.push(info);

            // Rate limit between symbols
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.error(`[DatasetBuilder] Error building ${symbol}:`, error);
            symbols.push({
                symbol,
                barCount: 0,
                startDate: '',
                endDate: '',
                completenessPercent: 0,
                gaps: [],
                isValid: false,
            });
        }
    }

    // Calculate data stats
    const validCount = symbols.filter(s => s.isValid).length;
    const totalBars = symbols.reduce((sum, s) => sum + s.barCount, 0);
    const dataLimited = validCount === 0 || totalBars === 0;

    // Log if data is limited
    if (dataLimited) {
        console.warn(`[plan-limited] No valid data received - API key may be invalid or plan restricted.`);
    }

    // Create manifest
    const manifest: DatasetManifest = {
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        dataLimited,
        symbols,
        config: {
            universe,
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
        },
    };

    // Write manifest
    const manifestPath = path.join(DATASETS_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`[DatasetBuilder] Complete!`);
    console.log(`[DatasetBuilder] Valid symbols: ${validCount}/${universe.length}`);
    console.log(`[DatasetBuilder] Total bars: ${totalBars}`);
    if (dataLimited) {
        console.log(`[DatasetBuilder] dataLimited: true`);
    }
    console.log(`[DatasetBuilder] Manifest written to: ${manifestPath}`);

    return manifest;
}

/**
 * Load dataset for a symbol
 */
export function loadSymbolDataset(symbol: string): OHLCVBar[] {
    const filePath = path.join(DATASETS_DIR, `${symbol}.json`);

    if (!fs.existsSync(filePath)) {
        console.warn(`[DatasetBuilder] No dataset for ${symbol}`);
        return [];
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.bars || [];
    } catch (error) {
        console.error(`[DatasetBuilder] Error loading ${symbol}:`, error);
        return [];
    }
}

/**
 * Load manifest
 */
export function loadManifest(): DatasetManifest | null {
    const manifestPath = path.join(DATASETS_DIR, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        console.error('[DatasetBuilder] Error loading manifest:', error);
        return null;
    }
}

/**
 * Get valid symbols from manifest
 */
export function getValidSymbols(): string[] {
    const manifest = loadManifest();
    if (!manifest) return [];

    return manifest.symbols
        .filter(s => s.isValid)
        .map(s => s.symbol);
}
