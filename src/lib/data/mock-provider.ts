/**
 * Mock Data Provider
 * 
 * Provides realistic mock data for development and testing.
 * Simulates API behavior without actual network calls.
 */

import type { MarketDataProvider } from './provider';
import type {
    Candle,
    Timeframe,
    Quote,
    SymbolInfo,
    AggregateBar,
    DataResponse,
    FundamentalData,
    TechnicalIndicator,
} from './types';

// Mock stock data
const MOCK_STOCKS: Record<string, SymbolInfo> = {
    AAPL: { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Consumer Electronics' },
    MSFT: { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Software' },
    GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Internet Services' },
    AMZN: { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Consumer Cyclical', industry: 'E-Commerce' },
    TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
    NVDA: { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
    META: { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Internet Services' },
    AMD: { symbol: 'AMD', name: 'Advanced Micro Devices', exchange: 'NASDAQ', type: 'stock', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
    SPY: { symbol: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'NYSE', type: 'etf', currency: 'USD' },
    QQQ: { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', type: 'etf', currency: 'USD' },
};

// Mock price data (base prices)
const MOCK_PRICES: Record<string, number> = {
    AAPL: 182.50,
    MSFT: 415.20,
    GOOGL: 175.80,
    AMZN: 185.60,
    TSLA: 248.50,
    NVDA: 890.00,
    META: 510.30,
    AMD: 165.40,
    SPY: 510.00,
    QQQ: 440.00,
};

/**
 * Generates realistic OHLCV data with random walk
 */
function generateMockCandles(
    basePrice: number,
    count: number,
    timeframe: Timeframe,
    endDate: Date
): Candle[] {
    const candles: Candle[] = [];
    let price = basePrice;

    // Calculate interval in ms
    const intervals: Record<Timeframe, number> = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000,
        '1M': 30 * 24 * 60 * 60 * 1000,
    };

    const interval = intervals[timeframe];
    let timestamp = endDate.getTime() - (count * interval);

    for (let i = 0; i < count; i++) {
        // Random walk with mean reversion
        const volatility = 0.02; // 2% typical daily move
        const change = (Math.random() - 0.5) * volatility * price;

        const open = price;
        price += change;
        const close = price;

        // Generate high/low within the open-close range
        const range = Math.abs(close - open);
        const high = Math.max(open, close) + Math.random() * range * 0.5;
        const low = Math.min(open, close) - Math.random() * range * 0.5;

        // Volume with some randomization
        const avgVolume = 5000000;
        const volume = Math.floor(avgVolume * (0.5 + Math.random()));

        candles.push({
            timestamp,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
            volume,
            vwap: Number(((high + low + close) / 3).toFixed(2)),
        });

        timestamp += interval;
    }

    return candles;
}

export class MockProvider implements MarketDataProvider {
    readonly name = 'Mock Data';
    readonly isLive = false;

    private connected = false;
    private simulateDelay = true;

    constructor(options?: { simulateDelay?: boolean }) {
        this.simulateDelay = options?.simulateDelay ?? true;
    }

    private async delay(): Promise<void> {
        if (this.simulateDelay) {
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        await this.delay();
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async searchSymbols(query: string): Promise<DataResponse<SymbolInfo[]>> {
        await this.delay();

        const queryLower = query.toLowerCase();
        const results = Object.values(MOCK_STOCKS).filter(
            s => s.symbol.toLowerCase().includes(queryLower) ||
                s.name.toLowerCase().includes(queryLower)
        );

        return {
            data: results,
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    async getSymbolInfo(symbol: string): Promise<DataResponse<SymbolInfo>> {
        await this.delay();

        const info = MOCK_STOCKS[symbol.toUpperCase()];
        if (!info) {
            throw { code: 'INVALID_SYMBOL', message: `Symbol ${symbol} not found` };
        }

        return {
            data: info,
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    async getQuote(symbol: string): Promise<DataResponse<Quote>> {
        await this.delay();

        const basePrice = MOCK_PRICES[symbol.toUpperCase()];
        if (!basePrice) {
            throw { code: 'INVALID_SYMBOL', message: `Symbol ${symbol} not found` };
        }

        // Add some random variation
        const variation = (Math.random() - 0.5) * 0.01 * basePrice;
        const last = basePrice + variation;
        const spread = last * 0.001; // 0.1% spread

        return {
            data: {
                symbol,
                bid: Number((last - spread).toFixed(2)),
                ask: Number((last + spread).toFixed(2)),
                bidSize: Math.floor(100 + Math.random() * 500),
                askSize: Math.floor(100 + Math.random() * 500),
                last: Number(last.toFixed(2)),
                lastSize: Math.floor(100 + Math.random() * 200),
                timestamp: Date.now(),
            },
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    async getQuotes(symbols: string[]): Promise<DataResponse<Map<string, Quote>>> {
        const quotes = new Map<string, Quote>();

        for (const symbol of symbols) {
            try {
                const result = await this.getQuote(symbol);
                quotes.set(symbol, result.data);
            } catch {
                // Skip invalid symbols
            }
        }

        return {
            data: quotes,
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    async getCandles(
        symbol: string,
        timeframe: Timeframe,
        from: Date,
        to: Date
    ): Promise<DataResponse<AggregateBar>> {
        await this.delay();

        const basePrice = MOCK_PRICES[symbol.toUpperCase()];
        if (!basePrice) {
            throw { code: 'INVALID_SYMBOL', message: `Symbol ${symbol} not found` };
        }

        // Calculate number of candles based on date range and timeframe
        const msPerCandle: Record<Timeframe, number> = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000,
        };

        const duration = to.getTime() - from.getTime();
        const count = Math.min(Math.floor(duration / msPerCandle[timeframe]), 500);

        const candles = generateMockCandles(basePrice, count, timeframe, to);

        return {
            data: {
                symbol,
                candles,
                timeframe,
                fromDate: from.toISOString().split('T')[0],
                toDate: to.toISOString().split('T')[0],
            },
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    supportsOptions(): boolean {
        return false;
    }

    supportsFundamentals(): boolean {
        return true;
    }

    async getFundamentals(symbol: string): Promise<DataResponse<FundamentalData>> {
        await this.delay();

        const basePrice = MOCK_PRICES[symbol.toUpperCase()];
        if (!basePrice) {
            throw { code: 'INVALID_SYMBOL', message: `Symbol ${symbol} not found` };
        }

        // Generate reasonable mock fundamentals
        const marketCap = basePrice * (1000000000 + Math.random() * 2000000000);

        return {
            data: {
                symbol,
                marketCap,
                peRatio: 15 + Math.random() * 30,
                eps: basePrice / (15 + Math.random() * 30),
                dividendYield: Math.random() * 0.03,
                beta: 0.8 + Math.random() * 0.8,
                fiftyTwoWeekHigh: basePrice * 1.3,
                fiftyTwoWeekLow: basePrice * 0.7,
                avgVolume: 10000000 + Math.random() * 50000000,
                sharesOutstanding: marketCap / basePrice,
            },
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }

    supportsIndicators(): boolean {
        return true;
    }

    async getIndicator(
        symbol: string,
        indicator: string,
        _params: Record<string, number>
    ): Promise<DataResponse<TechnicalIndicator>> {
        await this.delay();

        const basePrice = MOCK_PRICES[symbol.toUpperCase()];
        if (!basePrice) {
            throw { code: 'INVALID_SYMBOL', message: `Symbol ${symbol} not found` };
        }

        // Generate mock indicator values
        let value: number;
        let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';

        switch (indicator.toUpperCase()) {
            case 'RSI':
                value = 30 + Math.random() * 40; // RSI between 30-70
                signal = value > 70 ? 'bearish' : value < 30 ? 'bullish' : 'neutral';
                break;
            case 'MACD':
                value = (Math.random() - 0.5) * 5;
                signal = value > 0 ? 'bullish' : value < 0 ? 'bearish' : 'neutral';
                break;
            case 'SMA':
            case 'EMA':
                value = basePrice * (0.98 + Math.random() * 0.04);
                signal = basePrice > value ? 'bullish' : 'bearish';
                break;
            default:
                value = Math.random() * 100;
        }

        return {
            data: {
                name: indicator.toUpperCase(),
                value,
                signal,
                timestamp: Date.now(),
            },
            cached: false,
            timestamp: Date.now(),
            source: 'mock',
        };
    }
}
