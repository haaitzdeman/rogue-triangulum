/**
 * Polygon Training Provider
 * 
 * Connects to Polygon.io API for real historical market data.
 * Used for training agents on actual market conditions.
 */

import type { TrainingProvider, OHLCVBar, Timeframe, OptionChainItem, MarketEvent } from './provider-adapter';

// API key from environment
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
const BASE_URL = 'https://api.polygon.io';

/**
 * Convert our timeframe to Polygon's multiplier/timespan
 */
function timeframeToPolygon(tf: Timeframe): { multiplier: number; timespan: string } {
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
 * Format date for Polygon API
 */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Polygon Training Provider
 */
export class PolygonTrainingProvider implements TrainingProvider {
    readonly name = 'Polygon.io';
    readonly supportedTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

    private requestCount = 0;
    private lastRequestTime = 0;
    private readonly minRequestInterval = 250; // Rate limit: 4 requests/second for free tier

    /**
     * Rate-limited fetch
     */
    private async rateLimitedFetch(url: string): Promise<Response> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(r => setTimeout(r, this.minRequestInterval - timeSinceLastRequest));
        }

        this.lastRequestTime = Date.now();
        this.requestCount++;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
        }

        return response;
    }

    /**
     * Get OHLCV bars from Polygon
     */
    async getOHLCV(
        symbol: string,
        timeframe: Timeframe,
        start: Date,
        end: Date
    ): Promise<OHLCVBar[]> {
        const { multiplier, timespan } = timeframeToPolygon(timeframe);
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const url = `${BASE_URL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startStr}/${endStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;

        try {
            const response = await this.rateLimitedFetch(url);
            const data = await response.json();

            if (data.status === 'ERROR') {
                console.error(`[Polygon] API Error for ${symbol}:`, data.error);
                return [];
            }

            if (!data.results || data.results.length === 0) {
                console.warn(`[Polygon] No data for ${symbol} from ${startStr} to ${endStr}`);
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

            console.log(`[Polygon] Fetched ${bars.length} bars for ${symbol}`);
            return bars;
        } catch (error) {
            console.error(`[Polygon] Error fetching ${symbol}:`, error);
            return [];
        }
    }

    /**
     * Get options chain (requires higher tier API)
     */
    async getOptionChain(symbol: string, _date: Date): Promise<OptionChainItem[]> {
        // Options data requires a higher tier, return empty for now
        console.warn(`[Polygon] Options chain not available for free tier`);
        return [];
    }

    /**
     * Get market events
     */
    async getEvents(_start: Date, _end: Date, _symbols?: string[]): Promise<MarketEvent[]> {
        // Events endpoint - for now return empty
        return [];
    }

    /**
     * Check if API key is available
     */
    async isAvailable(): Promise<boolean> {
        if (!POLYGON_API_KEY || POLYGON_API_KEY === 'your_api_key_here') {
            console.warn('[Polygon] No API key configured');
            return false;
        }

        try {
            // Test with a simple request
            const url = `${BASE_URL}/v2/aggs/ticker/AAPL/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
            const response = await this.rateLimitedFetch(url);
            const data = await response.json();
            return data.status === 'OK';
        } catch {
            return false;
        }
    }

    /**
     * Get request count for monitoring
     */
    getRequestCount(): number {
        return this.requestCount;
    }
}
