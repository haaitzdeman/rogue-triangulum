'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppMode } from '@/contexts/AppModeContext';
import { useDataProvider } from '@/hooks/useMarketData';
import { PolygonProvider } from '@/lib/data';
import type { Candle } from '@/lib/data/types';

export interface OptionsAnalysis {
    symbol: string;
    name: string;
    currentPrice: number;
    priceChange: number;
    priceChangePercent: number;
    // Volatility metrics calculated from stock data
    hv20: number;  // 20-day historical volatility
    hv50: number;  // 50-day historical volatility
    hvRank: number; // Where current HV sits vs past year (0-100)
    hvPercentile: number;
    // Price levels
    high52w: number;
    low52w: number;
    avgVolume: number;
    currentVolume: number;
    volumeRatio: number;
    // Trend
    trend: 'bullish' | 'bearish' | 'neutral';
    trendStrength: number;
}

const STOCK_NAMES: Record<string, string> = {
    AAPL: 'Apple Inc.',
    NVDA: 'NVIDIA Corp',
    TSLA: 'Tesla Inc.',
    AMD: 'AMD Inc.',
    META: 'Meta Platforms',
    SPY: 'SPDR S&P 500 ETF',
    QQQ: 'Invesco QQQ Trust',
    MSFT: 'Microsoft Corp',
};

const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'META', 'SPY'];

// Calculate historical volatility from daily returns
function calculateHV(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return 0;

    const returns: number[] = [];
    const recentCandles = candles.slice(-period - 1);

    for (let i = 1; i < recentCandles.length; i++) {
        const dailyReturn = Math.log(recentCandles[i].close / recentCandles[i - 1].close);
        returns.push(dailyReturn);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize: multiply by sqrt(252 trading days)
    return stdDev * Math.sqrt(252) * 100;
}

// Calculate HV Rank (where current HV sits vs past year)
function calculateHVRank(candles: Candle[], currentHV: number): number {
    if (candles.length < 252) return 50;

    // Calculate rolling 20-day HV for each day in past year
    const hvValues: number[] = [];
    for (let i = 21; i < candles.length; i++) {
        const slice = candles.slice(i - 21, i);
        const hv = calculateHV(slice, 20);
        if (hv > 0) hvValues.push(hv);
    }

    if (hvValues.length === 0) return 50;

    // Rank = percentage of values below current
    const belowCount = hvValues.filter(v => v < currentHV).length;
    return Math.round((belowCount / hvValues.length) * 100);
}

async function analyzeSymbol(
    symbol: string,
    provider: PolygonProvider
): Promise<OptionsAnalysis | null> {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1); // 1 year of data

        const response = await provider.getCandles(symbol, '1d', startDate, endDate);
        const candles: Candle[] = (response as any)?.data?.candles || [];

        if (!candles || candles.length < 50) return null;

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        // Calculate volatility metrics
        const hv20 = calculateHV(candles, 20);
        const hv50 = calculateHV(candles, 50);
        const hvRank = calculateHVRank(candles, hv20);

        // Price metrics
        const prices = candles.map(c => c.close);
        const high52w = Math.max(...prices);
        const low52w = Math.min(...prices);

        // Volume metrics
        const volumes = candles.map(c => c.volume);
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const currentVolume = current.volume;

        // Trend analysis
        const sma20 = candles.slice(-20).reduce((a, c) => a + c.close, 0) / 20;
        const sma50 = candles.slice(-50).reduce((a, c) => a + c.close, 0) / 50;

        let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let trendStrength = 0;

        if (current.close > sma20 && sma20 > sma50) {
            trend = 'bullish';
            trendStrength = ((current.close - sma50) / sma50) * 100;
        } else if (current.close < sma20 && sma20 < sma50) {
            trend = 'bearish';
            trendStrength = ((sma50 - current.close) / sma50) * 100;
        }

        const priceChange = current.close - prev.close;
        const priceChangePercent = (priceChange / prev.close) * 100;

        return {
            symbol,
            name: STOCK_NAMES[symbol] || symbol,
            currentPrice: current.close,
            priceChange,
            priceChangePercent,
            hv20,
            hv50,
            hvRank,
            hvPercentile: hvRank,
            high52w,
            low52w,
            avgVolume,
            currentVolume,
            volumeRatio: avgVolume > 0 ? currentVolume / avgVolume : 1,
            trend,
            trendStrength: Math.abs(trendStrength),
        };
    } catch (err) {
        console.error(`Error analyzing ${symbol}:`, err);
        return null;
    }
}

export function useLiveOptionsData(symbols: string[] = DEFAULT_SYMBOLS) {
    const { isLive, isTest } = useAppMode();
    const { isMockMode } = useDataProvider();
    const [data, setData] = useState<OptionsAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            const provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });

            const results: OptionsAnalysis[] = [];

            for (const symbol of symbols) {
                const analysis = await analyzeSymbol(symbol, provider);
                if (analysis) {
                    results.push(analysis);
                }
                // Rate limiting delay
                await new Promise(r => setTimeout(r, 250));
            }

            // Sort by HV Rank (highest first - best for options selling)
            results.sort((a, b) => b.hvRank - a.hvRank);

            setData(results);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Options data fetch error:', err);
            setError('Failed to fetch options data');
        } finally {
            setLoading(false);
        }
    }, [symbols]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return {
        data,
        loading,
        error,
        lastUpdate,
        refresh: fetchData,
        isLiveData: !isMockMode,
    };
}
