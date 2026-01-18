'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppMode } from '@/contexts/AppModeContext';
import { useDataProvider, useCandles } from '@/hooks/useMarketData';
import { PolygonProvider } from '@/lib/data';
import type { Candle, Timeframe } from '@/lib/data/types';

// Candidate interface matching the existing mock format
export interface TradingCandidate {
    id: string;
    symbol: string;
    name: string;
    setupType: string;
    score: number;
    confidence: number;
    priceChange: number;
    invalidation: number;
    reasons: string[];
    direction: 'long' | 'short';
    currentPrice: number;
    signals: {
        name: string;
        direction: string;
        strength: number;
    }[];
}

// Stock names for display
const STOCK_NAMES: Record<string, string> = {
    AAPL: 'Apple Inc.',
    NVDA: 'NVIDIA Corp',
    TSLA: 'Tesla Inc.',
    AMD: 'AMD Inc.',
    META: 'Meta Platforms',
    MSFT: 'Microsoft Corp',
    GOOGL: 'Alphabet Inc.',
    AMZN: 'Amazon.com Inc.',
    SPY: 'SPDR S&P 500 ETF',
    QQQ: 'Invesco QQQ Trust',
};

// Default watchlist for scanning
const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'META', 'MSFT', 'GOOGL', 'AMZN'];

// Mock candidates for test mode
const MOCK_CANDIDATES: TradingCandidate[] = [
    {
        id: 'mock-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        setupType: 'VWAP Reclaim',
        score: 78,
        confidence: 0.82,
        priceChange: 1.24,
        invalidation: 178.50,
        reasons: ['Above VWAP', 'Volume surge 2.1x', 'Sector strength'],
        direction: 'long',
        currentPrice: 182.50,
        signals: [],
    },
    {
        id: 'mock-2',
        symbol: 'NVDA',
        name: 'NVIDIA Corp',
        setupType: 'ORB Breakout',
        score: 85,
        confidence: 0.75,
        priceChange: 2.87,
        invalidation: 875.00,
        reasons: ['Opening range break', 'RVOL 3.2x', 'Momentum thrust'],
        direction: 'long',
        currentPrice: 912.00,
        signals: [],
    },
    {
        id: 'mock-3',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        setupType: 'Level Test',
        score: 62,
        confidence: 0.58,
        priceChange: -0.45,
        invalidation: 242.00,
        reasons: ['Key support test', 'Mixed volume', 'Sector neutral'],
        direction: 'long',
        currentPrice: 245.00,
        signals: [],
    },
];

// Technical indicator calculations
function calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } {
    const closes = candles.map(c => c.close);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macd = ema12 - ema26;
    // Simplified signal line
    const signal = macd * 0.9;
    return { macd, signal, histogram: macd - signal };
}

function calculateEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;

    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
    }

    return ema;
}

function calculateVolumeRatio(candles: Candle[]): number {
    if (candles.length < 20) return 1;
    const recentVol = candles[candles.length - 1].volume;
    const avgVol = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
    return avgVol > 0 ? recentVol / avgVol : 1;
}

function analyzeCandidate(
    symbol: string,
    candles: Candle[],
    desk: 'day-trading' | 'swing' | 'options' | 'investing'
): TradingCandidate | null {
    if (!candles || candles.length < 30) return null;

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const priceChange = prev ? ((current.close - prev.close) / prev.close) * 100 : 0;

    const rsi = calculateRSI(candles);
    const macd = calculateMACD(candles);
    const volumeRatio = calculateVolumeRatio(candles);

    const signals: TradingCandidate['signals'] = [];
    const reasons: string[] = [];
    let score = 50;
    let direction: 'long' | 'short' = 'long';
    let setupType = 'Neutral';

    // RSI analysis
    if (rsi < 35) {
        signals.push({ name: 'RSI', direction: 'long', strength: 0.7 });
        reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
        score += 10;
        direction = 'long';
        setupType = 'Oversold Bounce';
    } else if (rsi > 65) {
        signals.push({ name: 'RSI', direction: 'short', strength: 0.6 });
        reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
        score += 5;
        direction = 'short';
        setupType = 'Overbought Fade';
    }

    // MACD analysis
    if (macd.histogram > 0 && macd.macd > macd.signal) {
        signals.push({ name: 'MACD', direction: 'long', strength: 0.6 });
        reasons.push('MACD bullish crossover');
        score += 8;
        if (direction === 'long') score += 5;
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
        signals.push({ name: 'MACD', direction: 'short', strength: 0.5 });
        reasons.push('MACD bearish crossover');
        score += 5;
    }

    // Volume analysis
    if (volumeRatio > 1.5) {
        reasons.push(`Volume ${volumeRatio.toFixed(1)}x average`);
        score += 7;
    }

    // Price momentum
    if (priceChange > 1.5) {
        reasons.push('Strong upward momentum');
        score += 6;
        if (direction === 'long') setupType = 'Momentum Breakout';
    } else if (priceChange < -1.5) {
        reasons.push('Strong downward pressure');
        if (direction === 'short') score += 6;
    }

    // Only return if we have meaningful signals
    if (reasons.length < 2 || score < 55) return null;

    const confidence = Math.min(0.95, (score - 50) / 50 + 0.5);
    const invalidation = direction === 'long'
        ? current.close * 0.98
        : current.close * 1.02;

    return {
        id: `${symbol}-${Date.now()}`,
        symbol,
        name: STOCK_NAMES[symbol] || symbol,
        setupType,
        score: Math.min(100, Math.round(score)),
        confidence,
        priceChange: parseFloat(priceChange.toFixed(2)),
        invalidation: parseFloat(invalidation.toFixed(2)),
        reasons,
        direction,
        currentPrice: current.close,
        signals,
    };
}

export function useLiveScanner(
    desk: 'day-trading' | 'swing' | 'options' | 'investing' = 'day-trading',
    symbols: string[] = DEFAULT_SYMBOLS
) {
    const { isLive, isTest } = useAppMode();
    const { isMockMode } = useDataProvider();
    const [candidates, setCandidates] = useState<TradingCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastScan, setLastScan] = useState<Date | null>(null);

    const scanSymbols = useCallback(async () => {
        // In test mode, return mock candidates
        if (isTest || isMockMode) {
            setCandidates(MOCK_CANDIDATES);
            setLoading(false);
            setLastScan(new Date());
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            const provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });
            const newCandidates: TradingCandidate[] = [];
            const timeframe: Timeframe = desk === 'day-trading' ? '5m' : '1d';

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - (desk === 'day-trading' ? 5 : 60));

            for (const symbol of symbols) {
                try {
                    const response = await provider.getCandles(symbol, timeframe, startDate, endDate);
                    // Extract data from DataResponse wrapper
                    const candles: Candle[] = (response as any)?.data?.candles || [];
                    const candidate = analyzeCandidate(symbol, candles as Candle[], desk);

                    if (candidate) {
                        newCandidates.push(candidate);
                    }

                    // Brief delay to avoid rate limiting
                    await new Promise(r => setTimeout(r, 200));
                } catch (err) {
                    console.error(`Error scanning ${symbol}:`, err);
                }
            }

            // Sort by score descending
            newCandidates.sort((a, b) => b.score - a.score);

            setCandidates(newCandidates);
            setLastScan(new Date());
        } catch (err) {
            console.error('Scanner error:', err);
            setError('Failed to scan symbols');
            // Fall back to mock data on error
            setCandidates(MOCK_CANDIDATES);
        } finally {
            setLoading(false);
        }
    }, [isTest, isMockMode, desk, symbols]);

    // Initial scan
    useEffect(() => {
        scanSymbols();
    }, [scanSymbols]);

    return {
        candidates,
        loading,
        error,
        lastScan,
        rescan: scanSymbols,
        isLiveData: isLive && !isMockMode,
    };
}
