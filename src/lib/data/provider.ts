/**
 * Abstract Market Data Provider Interface
 * 
 * This interface defines the contract for all market data providers.
 * Implementations include:
 * - PolygonProvider (live data from Polygon.io/massive.com)
 * - MockProvider (development/testing data)
 */

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
    DataError,
} from './types';

export interface MarketDataProvider {
    // Provider identification
    readonly name: string;
    readonly isLive: boolean;

    // Connection status
    isConnected(): boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;

    // Symbol lookup
    searchSymbols(query: string): Promise<DataResponse<SymbolInfo[]>>;
    getSymbolInfo(symbol: string): Promise<DataResponse<SymbolInfo>>;

    // Price data
    getQuote(symbol: string): Promise<DataResponse<Quote>>;
    getQuotes(symbols: string[]): Promise<DataResponse<Map<string, Quote>>>;

    // Historical data (OHLCV)
    getCandles(
        symbol: string,
        timeframe: Timeframe,
        from: Date,
        to: Date
    ): Promise<DataResponse<AggregateBar>>;

    // Options (if supported)
    supportsOptions(): boolean;
    getOptionChain?(
        underlying: string,
        expiration?: string
    ): Promise<DataResponse<OptionContract[]>>;
    getIVData?(symbol: string): Promise<DataResponse<IVData>>;

    // Fundamentals (if supported)
    supportsFundamentals(): boolean;
    getFundamentals?(symbol: string): Promise<DataResponse<FundamentalData>>;

    // Technical indicators (if supported)
    supportsIndicators(): boolean;
    getIndicator?(
        symbol: string,
        indicator: string,
        params: Record<string, number>
    ): Promise<DataResponse<TechnicalIndicator>>;

    // Calendar events
    getEarningsCalendar?(
        from: Date,
        to: Date
    ): Promise<DataResponse<CalendarEvent[]>>;
    getEconomicCalendar?(
        from: Date,
        to: Date
    ): Promise<DataResponse<CalendarEvent[]>>;
}

/**
 * Provider factory - creates the appropriate data provider based on config
 */
export type ProviderType = 'polygon' | 'mock';

export interface ProviderConfig {
    type: ProviderType;
    apiKey?: string;
    rateLimit?: number;  // Calls per minute
    cacheEnabled?: boolean;
    cacheTTL?: number;   // Cache time-to-live in seconds
}

// Result type for operations that can fail
export type Result<T, E = DataError> =
    | { success: true; data: T }
    | { success: false; error: E };
