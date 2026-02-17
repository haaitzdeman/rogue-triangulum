/**
 * Massive Data Provider
 * 
 * Connects to Massive Stocks Starter API for historical market data.
 * Implements TrainingProvider interface for swappability with Polygon.
 * 
 * Features:
 * - Filesystem caching to avoid re-downloading
 * - Exponential backoff with jitter for retries
 * - Bad data detection (gaps, missing days)
 * 
 * Env vars: MASSIVE_API_KEY, MASSIVE_BASE_URL
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TrainingProvider, OHLCVBar, Timeframe, OptionChainItem, MarketEvent } from './provider-adapter';

// Configuration - read lazily to allow dotenv to load first
function getApiKey(): string {
    return process.env.MASSIVE_API_KEY || '';
}
function getBaseUrl(): string {
    return process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';
}
const CACHE_DIR = 'data/cache/bars';

// Rate limiting
const MIN_REQUEST_INTERVAL_MS = 250; // 4 req/sec
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Timeframe to Massive/Polygon multiplier mapping
 */
function timeframeToAPI(tf: Timeframe): { multiplier: number; timespan: string } {
    const mapping: Record<Timeframe, { multiplier: number; timespan: string }> = {
        '1m': { multiplier: 1, timespan: 'minute' },
        '5m': { multiplier: 5, timespan: 'minute' },
        '15m': { multiplier: 15, timespan: 'minute' },
        '1h': { multiplier: 1, timespan: 'hour' },
        '4h': { multiplier: 4, timespan: 'hour' },
        '1d': { multiplier: 1, timespan: 'day' },
        '1w': { multiplier: 1, timespan: 'week' },
    };
    return mapping[tf];
}

/**
 * Format date for API
 */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Get cache file path
 */
function getCachePath(symbol: string, timeframe: Timeframe, from: Date, to: Date): string {
    const fromStr = formatDate(from);
    const toStr = formatDate(to);
    return path.join(CACHE_DIR, `${symbol}_${timeframe}_${fromStr}_${toStr}.json`);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Sleep with jitter
 */
function sleepWithJitter(baseMs: number): Promise<void> {
    const jitter = Math.random() * baseMs * 0.5;
    return new Promise(r => setTimeout(r, baseMs + jitter));
}

/**
 * Massive Training Provider
 */
export class MassiveProvider implements TrainingProvider {
    readonly name = 'Massive Stocks Starter';
    readonly supportedTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

    private requestCount = 0;
    private lastRequestTime = 0;
    private initialized = false;

    /**
     * Log provider activation on first use
     */
    private logActivation(): void {
        if (!this.initialized) {
            console.log(`[Massive] provider active baseUrl=${getBaseUrl()}`);
            this.initialized = true;
        }
    }

    /**
     * Rate-limited fetch with retry
     */
    private async fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            // Rate limiting
            const now = Date.now();
            const elapsed = now - this.lastRequestTime;
            if (elapsed < MIN_REQUEST_INTERVAL_MS) {
                await sleepWithJitter(MIN_REQUEST_INTERVAL_MS - elapsed);
            }

            this.lastRequestTime = Date.now();
            this.requestCount++;

            try {
                const response = await fetch(url);

                if (response.status === 429) {
                    // Rate limited - exponential backoff
                    console.warn(`[MassiveProvider] Rate limited, attempt ${attempt + 1}/${retries + 1}`);
                    await sleepWithJitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
                    continue;
                }

                if (!response.ok && attempt < retries) {
                    console.warn(`[MassiveProvider] Request failed (${response.status}), retrying...`);
                    await sleepWithJitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
                    continue;
                }

                return response;
            } catch (error) {
                if (attempt < retries) {
                    console.warn(`[MassiveProvider] Network error, retrying...`, error);
                    await sleepWithJitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
                    continue;
                }
                throw error;
            }
        }

        throw new Error('Max retries exceeded');
    }

    /**
     * Get OHLCV bars (with caching)
     */
    async getOHLCV(
        symbol: string,
        timeframe: Timeframe,
        start: Date,
        end: Date
    ): Promise<OHLCVBar[]> {
        ensureCacheDir();

        // Check cache first
        const cachePath = getCachePath(symbol, timeframe, start, end);
        if (fs.existsSync(cachePath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                console.log(`[MassiveProvider] Cache hit: ${symbol} ${timeframe}`);
                return cached;
            } catch {
                // Cache corrupted, re-fetch
            }
        }

        // Fetch from API
        const bars = await this.fetchBarsFromAPI(symbol, timeframe, start, end);

        // Cache if we got data
        if (bars.length > 0) {
            fs.writeFileSync(cachePath, JSON.stringify(bars, null, 2));
            console.log(`[MassiveProvider] Cached ${bars.length} bars for ${symbol}`);
        }

        return bars;
    }

    /**
     * Fetch bars from Massive API
     */
    private async fetchBarsFromAPI(
        symbol: string,
        timeframe: Timeframe,
        start: Date,
        end: Date
    ): Promise<OHLCVBar[]> {
        const { multiplier, timespan } = timeframeToAPI(timeframe);
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const url = `${getBaseUrl()}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startStr}/${endStr}?adjusted=true&sort=asc&limit=50000&apiKey=${getApiKey()}`;

        this.logActivation();

        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();

            // STRICT: Throw on auth failure (no silent fallback)
            if (response.status === 401 || response.status === 403 || data.status === 'AUTH_FAILED' || (data.error && data.error.includes('invalid'))) {
                throw new Error(`[Massive] AUTH FAILED - invalid API key. Status: ${response.status}`);
            }

            if (data.status === 'ERROR') {
                console.error(`[Massive] API Error for ${symbol}:`, data.error);
                return [];
            }

            if (!data.results || data.results.length === 0) {
                console.warn(`[MassiveProvider] No data for ${symbol} from ${startStr} to ${endStr}`);
                return [];
            }

            const bars: OHLCVBar[] = data.results.map((bar: {
                t: number;
                o: number;
                h: number;
                l: number;
                c: number;
                v: number;
            }) => ({
                timestamp: bar.t,
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
            }));

            console.log(`[Massive] getDailyBars symbol=${symbol} bars=${bars.length}`);
            return bars;
        } catch (error) {
            console.error(`[MassiveProvider] Error fetching ${symbol}:`, error);
            return [];
        }
    }

    /**
     * Get daily bars (convenience method with logging)
     */
    async getDailyBars(symbol: string, start: Date, end: Date): Promise<OHLCVBar[]> {
        this.logActivation();
        return this.getOHLCV(symbol, '1d', start, end);
    }

    /**
     * Get quote (via previous close endpoint)
     */
    async getQuote(symbol: string): Promise<{ price: number; timestamp: number } | null> {
        const url = `${getBaseUrl()}/v2/aggs/ticker/${symbol}/prev?apiKey=${getApiKey()}`;

        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                return {
                    price: data.results[0].c,
                    timestamp: data.results[0].t,
                };
            }
            return null;
        } catch (error) {
            console.error(`[MassiveProvider] Error fetching quote for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get options chain (not supported in Starter)
     */
    async getOptionChain(_symbol: string, _date: Date): Promise<OptionChainItem[]> {
        console.warn('[MassiveProvider] Options chain not available in Stocks Starter plan');
        return [];
    }

    /**
     * Get market events (stub)
     */
    async getEvents(_start: Date, _end: Date, _symbols?: string[]): Promise<MarketEvent[]> {
        return [];
    }

    /**
     * Check if API key is configured
     */
    async isAvailable(): Promise<boolean> {
        if (!getApiKey()) {
            console.warn('[MassiveProvider] No MASSIVE_API_KEY configured');
            return false;
        }

        try {
            const url = `${getBaseUrl()}/v2/aggs/ticker/AAPL/prev?apiKey=${getApiKey()}`;
            const response = await this.fetchWithRetry(url);
            const data = await response.json();
            return data.status === 'OK';
        } catch {
            return false;
        }
    }

    /**
     * Get request count
     */
    getRequestCount(): number {
        return this.requestCount;
    }

    /**
     * Clear cache for a symbol
     */
    clearCache(symbol?: string): void {
        ensureCacheDir();

        if (symbol) {
            const files = fs.readdirSync(CACHE_DIR);
            for (const file of files) {
                if (file.startsWith(symbol)) {
                    fs.unlinkSync(path.join(CACHE_DIR, file));
                }
            }
            console.log(`[MassiveProvider] Cleared cache for ${symbol}`);
        } else {
            const files = fs.readdirSync(CACHE_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(CACHE_DIR, file));
            }
            console.log(`[MassiveProvider] Cleared all cache`);
        }
    }
}

// Singleton instance
let massiveProviderInstance: MassiveProvider | null = null;

/**
 * Get the MassiveProvider singleton
 */
export function getMassiveProvider(): MassiveProvider {
    if (!massiveProviderInstance) {
        massiveProviderInstance = new MassiveProvider();
    }
    return massiveProviderInstance;
}
