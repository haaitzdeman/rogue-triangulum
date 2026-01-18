/**
 * Training Provider Adapter
 * 
 * Flexible interface for historical data ingestion.
 * Supports multiple data providers with a unified API.
 */

import type { DeskType } from '../core/types';

/**
 * OHLCV bar data
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
 * Timeframe for data
 */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

/**
 * Options chain data
 */
export interface OptionChainItem {
    symbol: string;
    expiration: Date;
    strike: number;
    type: 'call' | 'put';
    bid: number;
    ask: number;
    last: number;
    volume: number;
    openInterest: number;
    iv: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
}

/**
 * Market event
 */
export interface MarketEvent {
    type: 'earnings' | 'dividend' | 'split' | 'fomc' | 'cpi' | 'other';
    symbol?: string;
    date: Date;
    description: string;
}

/**
 * Training Provider Interface
 */
export interface TrainingProvider {
    readonly name: string;
    readonly supportedTimeframes: Timeframe[];

    /**
     * Get OHLCV data
     */
    getOHLCV(
        symbol: string,
        timeframe: Timeframe,
        start: Date,
        end: Date
    ): Promise<OHLCVBar[]>;

    /**
     * Get options chain (if supported)
     */
    getOptionChain?(
        symbol: string,
        date: Date
    ): Promise<OptionChainItem[]>;

    /**
     * Get events calendar
     */
    getEvents?(
        start: Date,
        end: Date,
        symbols?: string[]
    ): Promise<MarketEvent[]>;

    /**
     * Check if provider is available
     */
    isAvailable(): Promise<boolean>;
}

/**
 * Mock Training Provider
 * 
 * Generates synthetic data for testing without API keys.
 */
export class MockTrainingProvider implements TrainingProvider {
    readonly name = 'Mock Provider';
    readonly supportedTimeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '1d'];

    async getOHLCV(
        symbol: string,
        timeframe: Timeframe,
        start: Date,
        end: Date
    ): Promise<OHLCVBar[]> {
        const bars: OHLCVBar[] = [];

        // Timeframe to milliseconds
        const tfMs: Record<Timeframe, number> = {
            '1m': 60000,
            '5m': 300000,
            '15m': 900000,
            '1h': 3600000,
            '4h': 14400000,
            '1d': 86400000,
            '1w': 604800000,
        };

        const interval = tfMs[timeframe];
        let timestamp = start.getTime();
        let price = 100 + Math.random() * 100; // Random starting price

        while (timestamp < end.getTime()) {
            // Random walk
            const change = (Math.random() - 0.5) * 2;
            price = Math.max(1, price * (1 + change / 100));

            const volatility = 0.02;
            const high = price * (1 + Math.random() * volatility);
            const low = price * (1 - Math.random() * volatility);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);

            bars.push({
                timestamp,
                open,
                high,
                low,
                close,
                volume: Math.floor(100000 + Math.random() * 900000),
            });

            timestamp += interval;
        }

        console.log(`[MockProvider] Generated ${bars.length} bars for ${symbol}`);
        return bars;
    }

    async getOptionChain(symbol: string, date: Date): Promise<OptionChainItem[]> {
        const chain: OptionChainItem[] = [];
        const basePrice = 100 + Math.random() * 100;

        // Generate strikes around the money
        for (let i = -5; i <= 5; i++) {
            const strike = Math.round(basePrice * (1 + i * 0.05));

            for (const type of ['call', 'put'] as const) {
                const itm = type === 'call' ? basePrice > strike : basePrice < strike;
                const iv = 0.2 + Math.random() * 0.3;

                chain.push({
                    symbol: `${symbol}${date.toISOString().slice(0, 10)}${type[0].toUpperCase()}${strike}`,
                    expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    strike,
                    type,
                    bid: itm ? 5 + Math.random() * 5 : Math.random() * 2,
                    ask: itm ? 5.5 + Math.random() * 5 : 0.5 + Math.random() * 2,
                    last: itm ? 5.25 + Math.random() * 5 : 0.25 + Math.random() * 2,
                    volume: Math.floor(Math.random() * 1000),
                    openInterest: Math.floor(Math.random() * 5000),
                    iv,
                    delta: type === 'call' ? 0.5 + i * 0.1 : -0.5 + i * 0.1,
                    gamma: 0.05 - Math.abs(i) * 0.01,
                    theta: -0.05 - Math.random() * 0.1,
                    vega: 0.1 + Math.random() * 0.1,
                });
            }
        }

        return chain;
    }

    async getEvents(start: Date, end: Date, symbols?: string[]): Promise<MarketEvent[]> {
        return [
            { type: 'fomc', date: new Date(), description: 'Mock FOMC Meeting' },
        ];
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }
}

// Singleton mock provider
let providerInstance: TrainingProvider | null = null;

export function getTrainingProvider(): TrainingProvider {
    if (!providerInstance) {
        providerInstance = new MockTrainingProvider();
    }
    return providerInstance;
}

export function setTrainingProvider(provider: TrainingProvider): void {
    providerInstance = provider;
}
