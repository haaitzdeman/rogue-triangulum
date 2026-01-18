/**
 * Core market data types used throughout the application
 */

// OHLCV candle data
export interface Candle {
    timestamp: number;    // Unix timestamp in ms
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;        // Volume-weighted average price (if available)
}

// Timeframe options
export type Timeframe =
    | '1m' | '5m' | '15m' | '30m'  // Intraday
    | '1h' | '4h'                   // Swing
    | '1d' | '1w' | '1M';           // Position/Investing

// Quote data for real-time prices
export interface Quote {
    symbol: string;
    bid: number;
    ask: number;
    bidSize: number;
    askSize: number;
    last: number;
    lastSize: number;
    timestamp: number;
}

// Stock/Symbol metadata
export interface SymbolInfo {
    symbol: string;
    name: string;
    exchange: string;
    type: 'stock' | 'etf' | 'crypto' | 'forex' | 'option';
    primaryExchange?: string;
    currency: string;
    sector?: string;
    industry?: string;
}

// Options Greeks
export interface OptionGreeks {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho?: number;
}

// Options contract data
export interface OptionContract {
    symbol: string;           // Option contract symbol
    underlying: string;       // Underlying stock symbol
    type: 'call' | 'put';
    strike: number;
    expiration: string;       // ISO date string
    bid: number;
    ask: number;
    last: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    greeks?: OptionGreeks;
}

// IV data for options analysis
export interface IVData {
    symbol: string;
    currentIV: number;
    ivRank: number;       // 0-100, where current IV sits in past year
    ivPercentile: number; // Percentage of days below current IV
    historicalIV30: number;
    historicalIV60: number;
    historicalIV90: number;
}

// Fundamental data snapshot
export interface FundamentalData {
    symbol: string;
    marketCap?: number;
    peRatio?: number;
    eps?: number;
    dividendYield?: number;
    beta?: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    avgVolume: number;
    sharesOutstanding?: number;
}

// Technical indicator results
export interface TechnicalIndicator {
    name: string;
    value: number | number[];
    signal?: 'bullish' | 'bearish' | 'neutral';
    timestamp: number;
}

// Market calendar event
export interface CalendarEvent {
    date: string;           // ISO date
    type: 'earnings' | 'dividend' | 'split' | 'economic' | 'holiday';
    symbol?: string;        // For stock-specific events
    title: string;
    description?: string;
    importance?: 'low' | 'medium' | 'high';
}

// Aggregate bar for historical data
export interface AggregateBar {
    symbol: string;
    candles: Candle[];
    timeframe: Timeframe;
    fromDate: string;
    toDate: string;
}

// API response wrapper
export interface DataResponse<T> {
    data: T;
    cached: boolean;
    timestamp: number;
    source: 'live' | 'mock' | 'cache';
}

// Error types
export interface DataError {
    code: 'RATE_LIMIT' | 'API_ERROR' | 'NETWORK' | 'INVALID_SYMBOL' | 'NO_DATA';
    message: string;
    retryAfter?: number;    // Seconds until retry is allowed
}
