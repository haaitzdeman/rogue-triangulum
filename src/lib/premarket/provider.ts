/**
 * Premarket Data Provider Adapter
 * 
 * Abstracts data access for premarket gap analysis.
 * Uses existing Massive provider when available, with open-fallback mode.
 * 
 * TERMINOLOGY: "Provider", "Data", "Fallback"
 * NOT: "Training", "Learning", "AI", "ML"
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DataMode, HistoricalBar, PremarketQuote, LivePremarketSnapshot } from './premarket-types';
import { loadTrainingConfig } from '../training/calibration-types';
import { loadSymbolDataset as loadBarsFromDataset } from '../training/dataset-builder';
import {
    fetchPolygonSnapshots,
    getEffectiveProvider,
    getEffectiveBaseUrl,
    getLiveProviderDiagnostics as getPolygonDiagnostics,
    type ProviderError,
} from './polygon-live-provider';

const DATASETS_DIR = 'data/datasets';

/**
 * Get the universe of symbols to scan
 */
export function getPremarketUniverse(): string[] {
    const { universe } = loadTrainingConfig();
    return universe;
}

/**
 * Get previous close for a symbol on a date
 * Uses cached dataset bars
 */
export function getPrevClose(symbol: string, date: Date): number | null {
    try {
        const bars = loadBarsFromDataset(symbol);
        if (!bars || bars.length === 0) return null;

        // Find the bar for the trading day BEFORE the given date
        const dateMs = date.getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Look for bar within 5 days before (to handle weekends)
        for (let i = 1; i <= 5; i++) {
            const targetDate = new Date(dateMs - i * oneDayMs);
            const targetStr = targetDate.toISOString().slice(0, 10);

            const bar = bars.find(b => {
                const barDate = new Date(b.timestamp).toISOString().slice(0, 10);
                return barDate === targetStr;
            });

            if (bar) {
                return bar.close;
            }
        }

        // Fallback: return most recent close
        return bars[bars.length - 1].close;
    } catch {
        return null;
    }
}

/**
 * Get premarket quote for a symbol
 * 
 * FALLBACK MODE: Since real premarket data requires specialized providers,
 * we use the open price as a surrogate when true premarket is unavailable.
 */
export function getPremarketQuote(symbol: string, date: Date): PremarketQuote | null {
    try {
        const bars = loadBarsFromDataset(symbol);
        if (!bars || bars.length === 0) return null;

        // Find bar for the given date
        const dateStr = date.toISOString().slice(0, 10);
        const bar = bars.find(b => {
            const barDate = new Date(b.timestamp).toISOString().slice(0, 10);
            return barDate === dateStr;
        });

        if (bar) {
            // Using open price as premarket surrogate
            return {
                price: bar.open,
                volume: bar.volume,
                high: bar.high,
                low: bar.low,
                dataMode: 'OPEN_FALLBACK' as DataMode,
            };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Get 20-day average daily volume for a symbol
 */
export function getAvgDailyVolume20(symbol: string, date: Date): number {
    try {
        const bars = loadBarsFromDataset(symbol);
        if (!bars || bars.length < 20) return 0;

        // Find bars before the given date
        const dateMs = date.getTime();
        const relevantBars = bars.filter(b => b.timestamp < dateMs);

        if (relevantBars.length < 20) {
            // Use all available bars
            const totalVolume = relevantBars.reduce((sum, b) => sum + b.volume, 0);
            return Math.round(totalVolume / relevantBars.length);
        }

        // Use last 20 bars
        const last20 = relevantBars.slice(-20);
        const totalVolume = last20.reduce((sum, b) => sum + b.volume, 0);
        return Math.round(totalVolume / 20);
    } catch {
        return 0;
    }
}

/**
 * Get historical bars for analog analysis
 */
export function getHistoricalBars(symbol: string, beforeDate: Date): HistoricalBar[] {
    try {
        const bars = loadBarsFromDataset(symbol);
        if (!bars) return [];

        const dateMs = beforeDate.getTime();

        return bars
            .filter(b => b.timestamp < dateMs)
            .map(b => ({
                date: new Date(b.timestamp).toISOString().slice(0, 10),
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
            }));
    } catch {
        return [];
    }
}

/**
 * Check if dataset exists for a symbol
 */
export function hasDataset(symbol: string): boolean {
    const filePath = path.join(DATASETS_DIR, `${symbol}.json`);
    return fs.existsSync(filePath);
}

// =============================================================================
// Live Premarket Provider
// =============================================================================

/**
 * Check if live premarket provider is available
 */
export function isLivePremarketAvailable(): boolean {
    const hasMassive = !!process.env.MASSIVE_API_KEY;
    const hasPolygon = !!process.env.POLYGON_API_KEY;
    return hasMassive || hasPolygon;
}

/**
 * Get live premarket snapshot for symbols
 * 
 * Fetches real-time data from Polygon API when configured.
 */
export async function getLivePremarketSnapshot(
    symbols: string[],
    _asOfDate: string
): Promise<Map<string, LivePremarketSnapshot>> {
    const result = new Map<string, LivePremarketSnapshot>();

    if (!isLivePremarketAvailable()) {
        // No live provider - return empty results
        for (const symbol of symbols) {
            result.set(symbol, {
                symbol,
                prevClose: null,
                premarketPrice: null,
                dataMode: 'OPEN_FALLBACK',
            });
        }
        return result;
    }

    // Fetch real data from Polygon
    const { snapshots } = await fetchPolygonSnapshots(symbols, {
        maxConcurrent: 5,
        delayMs: 50,
    });

    // Convert to LivePremarketSnapshot format
    for (const symbol of symbols) {
        const snapshot = snapshots.get(symbol);
        if (snapshot) {
            result.set(symbol, {
                symbol,
                prevClose: snapshot.prevClose,
                premarketPrice: snapshot.premarketPrice,
                livePrice: snapshot.livePrice,
                livePriceSource: snapshot.livePriceSource,
                premarketVolume: undefined,
                open: snapshot.open ?? undefined,
                dataMode: snapshot.dataMode,
            });
        } else {
            result.set(symbol, {
                symbol,
                prevClose: null,
                premarketPrice: null,
                dataMode: 'OPEN_FALLBACK',
            });
        }
    }

    return result;
}

// Re-export for diagnostics
export { getEffectiveProvider, getEffectiveBaseUrl, getPolygonDiagnostics };
export type { ProviderError };

// =============================================================================
// Diagnostics (DEV ONLY)
// =============================================================================

/**
 * Provider info for diagnostics (no secrets)
 */
export interface ProviderDiagnostics {
    providerName: string;
    hasMASSIVE_API_KEY: boolean;
    hasPOLYGON_API_KEY: boolean;
    datasetDir: string;
    datasetDirExists: boolean;
}

/**
 * Per-symbol diagnostic result
 */
export interface SymbolDiagnostic {
    symbol: string;
    ok: boolean;
    hasDataset: boolean;
    barCount: number;
    lastBarDate: string | null;
    prevClose: number | null;
    open: number | null;
    premarketPrice: number | null;
    modeUsed: 'PREMARKET' | 'OPEN_FALLBACK' | 'NONE';
    errorPreview: string | null;
}

/**
 * Get provider diagnostics (no secrets exposed)
 */
export function getProviderDiagnostics(): ProviderDiagnostics {
    return {
        providerName: 'dataset-file',
        hasMASSIVE_API_KEY: !!process.env.MASSIVE_API_KEY,
        hasPOLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
        datasetDir: DATASETS_DIR,
        datasetDirExists: fs.existsSync(DATASETS_DIR),
    };
}

/**
 * Get last available bar for a symbol
 */
export function getLastAvailableBar(symbol: string): { date: string; open: number; close: number } | null {
    try {
        const bars = loadBarsFromDataset(symbol);
        if (!bars || bars.length === 0) return null;

        const lastBar = bars[bars.length - 1];
        return {
            date: new Date(lastBar.timestamp).toISOString().slice(0, 10),
            open: lastBar.open,
            close: lastBar.close,
        };
    } catch {
        return null;
    }
}

/**
 * Diagnose a single symbol for data availability
 */
export function diagnoseSymbol(symbol: string, date: Date): SymbolDiagnostic {
    const result: SymbolDiagnostic = {
        symbol,
        ok: false,
        hasDataset: false,
        barCount: 0,
        lastBarDate: null,
        prevClose: null,
        open: null,
        premarketPrice: null,
        modeUsed: 'NONE',
        errorPreview: null,
    };

    try {
        result.hasDataset = hasDataset(symbol);
        if (!result.hasDataset) {
            result.errorPreview = `No dataset file found at ${path.join(DATASETS_DIR, symbol + '.json')}`;
            return result;
        }

        const bars = loadBarsFromDataset(symbol);
        result.barCount = bars?.length ?? 0;

        if (!bars || bars.length === 0) {
            result.errorPreview = 'Dataset exists but contains no bars';
            return result;
        }

        // Get last bar date
        const lastBar = getLastAvailableBar(symbol);
        result.lastBarDate = lastBar?.date ?? null;

        // Get prevClose
        const prevClose = getPrevClose(symbol, date);
        result.prevClose = prevClose;

        // Get open/premarket quote
        const quote = getPremarketQuote(symbol, date);
        if (quote) {
            result.open = quote.price;
            result.premarketPrice = quote.dataMode === 'PREMARKET' ? quote.price : null;
            result.modeUsed = quote.dataMode;
        } else {
            // Check if the date is in the future relative to dataset
            const dateStr = date.toISOString().slice(0, 10);
            if (lastBar && dateStr > lastBar.date) {
                result.errorPreview = `Requested date ${dateStr} is after last dataset bar ${lastBar.date}`;
            } else {
                result.errorPreview = `No bar found for date ${dateStr}`;
            }
        }

        // Success if we have both prevClose and open
        result.ok = result.prevClose !== null && result.open !== null;

    } catch (err) {
        result.errorPreview = err instanceof Error
            ? err.message.slice(0, 200)
            : 'Unknown error';
    }

    return result;
}
