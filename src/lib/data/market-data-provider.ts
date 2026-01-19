/**
 * Market Data Provider Interface
 * 
 * V1: Unified interface for all data fetching.
 * Both scanner (SwingBrain) and backtester use this interface.
 */

import type { Bar } from '../indicators';

/**
 * OHLCV bar with volume
 */
export interface OHLCVBar {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Quote data for real-time prices
 */
export interface Quote {
    symbol: string;
    bid: number;
    ask: number;
    last: number;
    timestamp: number;
}

/**
 * Timeframe specification
 */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

/**
 * Unified market data provider interface
 */
export interface MarketDataProvider {
    readonly name: string;

    /**
     * Fetch OHLCV candles for a symbol
     */
    getCandles(
        symbol: string,
        timeframe: Timeframe,
        startDate: Date,
        endDate: Date
    ): Promise<OHLCVBar[]>;

    /**
     * Get current quote for a symbol
     */
    getQuote(symbol: string): Promise<Quote | null>;

    /**
     * Check if provider is connected/ready
     */
    isReady(): boolean;
}

/**
 * Convert OHLCVBar to Bar format (used by indicators)
 */
export function toBar(ohlcv: OHLCVBar): Bar {
    return {
        timestamp: ohlcv.timestamp,
        open: ohlcv.open,
        high: ohlcv.high,
        low: ohlcv.low,
        close: ohlcv.close,
        volume: ohlcv.volume,
    };
}

/**
 * Convert array of OHLCVBar to Bar[]
 */
export function toBars(ohlcvBars: OHLCVBar[]): Bar[] {
    return ohlcvBars.map(toBar);
}
