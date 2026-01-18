"use client";

/**
 * React context and hooks for market data
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { MarketDataProvider } from '@/lib/data/provider';
import type { Quote, Candle, Timeframe, SymbolInfo, DataResponse, AggregateBar } from '@/lib/data/types';
import { MockProvider } from '@/lib/data/mock-provider';

// Context types
interface DataContextType {
    provider: MarketDataProvider;
    isConnected: boolean;
    isMockMode: boolean;
    toggleMockMode: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Provider component
export function DataProvider({ children }: { children: ReactNode }) {
    const [provider, setProvider] = useState<MarketDataProvider>(() => new MockProvider());
    const [isConnected, setIsConnected] = useState(false);
    const [isMockMode, setIsMockMode] = useState(true);

    useEffect(() => {
        // Connect on mount
        provider.connect()
            .then(() => setIsConnected(true))
            .catch((error) => {
                console.error('Failed to connect to data provider:', error);
                setIsConnected(false);
            });

        return () => {
            provider.disconnect();
        };
    }, [provider]);

    const toggleMockMode = useCallback(() => {
        // Disconnect current provider
        provider.disconnect();

        // Switch to other mode
        const newMode = !isMockMode;
        setIsMockMode(newMode);

        // Create new provider
        // In production, this would switch between Mock and Polygon
        const newProvider = new MockProvider();
        setProvider(newProvider);

        newProvider.connect()
            .then(() => setIsConnected(true))
            .catch(() => setIsConnected(false));
    }, [provider, isMockMode]);

    return (
        <DataContext.Provider value={{ provider, isConnected, isMockMode, toggleMockMode }}>
            {children}
        </DataContext.Provider>
    );
}

// Base hook to access provider
export function useDataProvider(): DataContextType {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useDataProvider must be used within a DataProvider');
    }
    return context;
}

// Hook for fetching quotes
export function useQuote(symbol: string | null) {
    const { provider, isConnected } = useDataProvider();
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!symbol || !isConnected) {
            setQuote(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        provider.getQuote(symbol)
            .then((response: DataResponse<Quote>) => {
                if (!cancelled) {
                    setQuote(response.data);
                    setLoading(false);
                }
            })
            .catch((err: { message?: string }) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to fetch quote');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [symbol, provider, isConnected]);

    return { quote, loading, error };
}

// Hook for fetching candles (OHLCV data)
export function useCandles(
    symbol: string | null,
    timeframe: Timeframe = '1d',
    days: number = 30
) {
    const { provider, isConnected } = useDataProvider();
    const [candles, setCandles] = useState<Candle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!symbol || !isConnected) {
            setCandles([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - days);

        provider.getCandles(symbol, timeframe, from, to)
            .then((response: DataResponse<AggregateBar>) => {
                if (!cancelled) {
                    setCandles(response.data.candles);
                    setLoading(false);
                }
            })
            .catch((err: { message?: string }) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to fetch candles');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [symbol, timeframe, days, provider, isConnected]);

    return { candles, loading, error };
}

// Hook for symbol search
export function useSymbolSearch(query: string, debounceMs: number = 300) {
    const { provider, isConnected } = useDataProvider();
    const [results, setResults] = useState<SymbolInfo[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query || query.length < 1 || !isConnected) {
            setResults([]);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);

            provider.searchSymbols(query)
                .then((response: DataResponse<SymbolInfo[]>) => {
                    if (!cancelled) {
                        setResults(response.data);
                        setLoading(false);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setResults([]);
                        setLoading(false);
                    }
                });
        }, debounceMs);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, debounceMs, provider, isConnected]);

    return { results, loading };
}

// Hook for fetching multiple quotes
export function useQuotes(symbols: string[]) {
    const { provider, isConnected } = useDataProvider();
    const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (symbols.length === 0 || !isConnected) {
            setQuotes(new Map());
            return;
        }

        let cancelled = false;
        setLoading(true);

        provider.getQuotes(symbols)
            .then((response: DataResponse<Map<string, Quote>>) => {
                if (!cancelled) {
                    setQuotes(response.data);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbols.join(','), provider, isConnected]);

    return { quotes, loading };
}
