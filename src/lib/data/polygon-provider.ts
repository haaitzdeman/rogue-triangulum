/**
 * Polygon.io (massive.com) Data Provider
 * 
 * Implements MarketDataProvider interface for live market data.
 * Rate limited to 5 calls/minute per API constraints.
 * 
 * API Capabilities:
 * - Forex & Crypto tickers
 * - End of Day data
 * - Minute Aggregates
 * - 2 years historical data
 * - Technical Indicators
 * - Reference Data
 */

import type { MarketDataProvider, ProviderConfig } from './provider';
import type {
    Candle,
    Timeframe,
    Quote,
    SymbolInfo,
    OptionContract,
    IVData,
    FundamentalData,
    TechnicalIndicator,
    CalendarEvent,
    AggregateBar,
    DataResponse,
} from './types';
import { RateLimiter } from './rate-limiter';

const POLYGON_BASE_URL = 'https://api.polygon.io';

// Map our timeframes to Polygon's multiplier/timespan format
const TIMEFRAME_MAP: Record<Timeframe, { multiplier: number; timespan: string }> = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '30m': { multiplier: 30, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '4h': { multiplier: 4, timespan: 'hour' },
    '1d': { multiplier: 1, timespan: 'day' },
    '1w': { multiplier: 1, timespan: 'week' },
    '1M': { multiplier: 1, timespan: 'month' },
};

export class PolygonProvider implements MarketDataProvider {
    readonly name = 'Polygon.io';
    readonly isLive = true;

    private apiKey: string;
    private rateLimiter: RateLimiter;
    private connected = false;

    constructor(config: ProviderConfig) {
        if (!config.apiKey) {
            throw new Error('Polygon API key is required');
        }
        this.apiKey = config.apiKey;
        this.rateLimiter = new RateLimiter(config.rateLimit ?? 5);
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        // Test connection with a simple API call
        try {
            await this.rateLimiter.acquire();
            const response = await fetch(
                `${POLYGON_BASE_URL}/v3/reference/tickers?limit=1&apiKey=${this.apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Polygon API error: ${response.status}`);
            }

            this.connected = true;
        } catch (error) {
            this.connected = false;
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    private async fetchWithRateLimit<T>(url: string): Promise<T> {
        await this.rateLimiter.acquire();

        const response = await fetch(`${url}&apiKey=${this.apiKey}`);

        if (!response.ok) {
            if (response.status === 429) {
                throw { code: 'RATE_LIMIT', message: 'Rate limit exceeded', retryAfter: 60 };
            }
            throw { code: 'API_ERROR', message: `API error: ${response.status}` };
        }

        return response.json();
    }

    async searchSymbols(query: string): Promise<DataResponse<SymbolInfo[]>> {
        const url = `${POLYGON_BASE_URL}/v3/reference/tickers?search=${encodeURIComponent(query)}&limit=20`;

        const data = await this.fetchWithRateLimit<{
            results: Array<{
                ticker: string;
                name: string;
                primary_exchange: string;
                type: string;
                currency_name: string;
                market: string;
            }>;
        }>(url);

        const symbols: SymbolInfo[] = (data.results || []).map(r => ({
            symbol: r.ticker,
            name: r.name,
            exchange: r.primary_exchange || 'UNKNOWN',
            type: r.type === 'CS' ? 'stock' : r.type === 'ETF' ? 'etf' : 'stock',
            currency: r.currency_name || 'USD',
        }));

        return {
            data: symbols,
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    async getSymbolInfo(symbol: string): Promise<DataResponse<SymbolInfo>> {
        const url = `${POLYGON_BASE_URL}/v3/reference/tickers/${symbol}`;

        const data = await this.fetchWithRateLimit<{
            results: {
                ticker: string;
                name: string;
                primary_exchange: string;
                type: string;
                currency_name: string;
                sic_description?: string;
            };
        }>(url);

        const r = data.results;
        return {
            data: {
                symbol: r.ticker,
                name: r.name,
                exchange: r.primary_exchange,
                type: r.type === 'CS' ? 'stock' : r.type === 'ETF' ? 'etf' : 'stock',
                currency: r.currency_name || 'USD',
                industry: r.sic_description,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    async getQuote(symbol: string): Promise<DataResponse<Quote>> {
        // Use previous day close for quote since real-time requires higher tier
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/prev`;

        const data = await this.fetchWithRateLimit<{
            results: Array<{
                c: number; // close
                h: number; // high
                l: number; // low
                o: number; // open
                v: number; // volume
                vw: number; // vwap
                t: number; // timestamp
            }>;
        }>(url);

        const r = data.results?.[0];
        if (!r) {
            throw { code: 'NO_DATA', message: `No data for ${symbol}` };
        }

        return {
            data: {
                symbol,
                bid: r.c * 0.999,  // Approximate bid
                ask: r.c * 1.001,  // Approximate ask
                bidSize: 100,
                askSize: 100,
                last: r.c,
                lastSize: 100,
                timestamp: r.t,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    async getQuotes(symbols: string[]): Promise<DataResponse<Map<string, Quote>>> {
        const quotes = new Map<string, Quote>();

        // Batch requests in groups to respect rate limit
        for (const symbol of symbols) {
            try {
                const result = await this.getQuote(symbol);
                quotes.set(symbol, result.data);
            } catch {
                // Skip symbols with errors
                console.warn(`Failed to get quote for ${symbol}`);
            }
        }

        return {
            data: quotes,
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    async getCandles(
        symbol: string,
        timeframe: Timeframe,
        from: Date,
        to: Date
    ): Promise<DataResponse<AggregateBar>> {
        const { multiplier, timespan } = TIMEFRAME_MAP[timeframe];
        const fromStr = from.toISOString().split('T')[0];
        const toStr = to.toISOString().split('T')[0];

        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=5000`;

        const data = await this.fetchWithRateLimit<{
            results: Array<{
                o: number;
                h: number;
                l: number;
                c: number;
                v: number;
                vw: number;
                t: number;
            }>;
        }>(url);

        const candles: Candle[] = (data.results || []).map(r => ({
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
            vwap: r.vw,
            timestamp: r.t,
        }));

        return {
            data: {
                symbol,
                candles,
                timeframe,
                fromDate: fromStr,
                toDate: toStr,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    // Options not fully supported in basic tier
    supportsOptions(): boolean {
        return false;
    }

    // Fundamentals via reference data
    supportsFundamentals(): boolean {
        return true;
    }

    async getFundamentals(symbol: string): Promise<DataResponse<FundamentalData>> {
        const url = `${POLYGON_BASE_URL}/v3/reference/tickers/${symbol}`;

        const data = await this.fetchWithRateLimit<{
            results: {
                ticker: string;
                market_cap?: number;
                share_class_shares_outstanding?: number;
            };
        }>(url);

        const r = data.results;

        // Get 52-week range from previous data
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const historyUrl = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/day/${oneYearAgo.toISOString().split('T')[0]}/${new Date().toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=365`;

        const historyData = await this.fetchWithRateLimit<{
            results: Array<{ h: number; l: number; v: number }>;
        }>(historyUrl);

        const highs = historyData.results?.map(r => r.h) || [];
        const lows = historyData.results?.map(r => r.l) || [];
        const volumes = historyData.results?.map(r => r.v) || [];

        return {
            data: {
                symbol,
                marketCap: r.market_cap,
                fiftyTwoWeekHigh: Math.max(...highs, 0),
                fiftyTwoWeekLow: Math.min(...lows, Infinity),
                avgVolume: volumes.length > 0
                    ? volumes.reduce((a, b) => a + b, 0) / volumes.length
                    : 0,
                sharesOutstanding: r.share_class_shares_outstanding,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }

    // Technical indicators supported
    supportsIndicators(): boolean {
        return true;
    }

    async getIndicator(
        symbol: string,
        indicator: string,
        params: Record<string, number>
    ): Promise<DataResponse<TechnicalIndicator>> {
        const indicatorLower = indicator.toLowerCase();
        const window = params.window || params.period || 14;

        const url = `${POLYGON_BASE_URL}/v1/indicators/${indicatorLower}/${symbol}?timespan=day&adjusted=true&window=${window}&series_type=close&order=desc&limit=1`;

        const data = await this.fetchWithRateLimit<{
            results: {
                values: Array<{ value: number; timestamp: number }>;
            };
        }>(url);

        const value = data.results?.values?.[0];
        if (!value) {
            throw { code: 'NO_DATA', message: `No indicator data for ${symbol}` };
        }

        return {
            data: {
                name: indicator.toUpperCase(),
                value: value.value,
                timestamp: value.timestamp,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'live',
        };
    }
}
