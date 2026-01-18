/**
 * Technical Indicators Library
 * 
 * Real calculations for trading indicators.
 * All functions are pure and work with OHLCV bar arrays.
 */

export interface Bar {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Simple Moving Average
 */
export function sma(bars: Bar[], period: number): number | null {
    if (bars.length < period) return null;
    const slice = bars.slice(-period);
    return slice.reduce((sum, b) => sum + b.close, 0) / period;
}

/**
 * Exponential Moving Average
 */
export function ema(bars: Bar[], period: number): number | null {
    if (bars.length < period) return null;

    const multiplier = 2 / (period + 1);

    // Start with SMA for first value
    let emaValue = bars.slice(0, period).reduce((sum, b) => sum + b.close, 0) / period;

    // Calculate EMA for remaining bars
    for (let i = period; i < bars.length; i++) {
        emaValue = (bars[i].close - emaValue) * multiplier + emaValue;
    }

    return emaValue;
}

/**
 * Volume Weighted Average Price (VWAP)
 * 
 * VWAP = Cumulative(Typical Price × Volume) / Cumulative(Volume)
 * Typical Price = (High + Low + Close) / 3
 */
export function vwap(bars: Bar[]): number | null {
    if (bars.length === 0) return null;

    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (const bar of bars) {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        cumulativeTPV += typicalPrice * bar.volume;
        cumulativeVolume += bar.volume;
    }

    if (cumulativeVolume === 0) return null;
    return cumulativeTPV / cumulativeVolume;
}

/**
 * VWAP with standard deviation bands
 */
export function vwapWithBands(bars: Bar[]): { vwap: number; upper: number; lower: number } | null {
    if (bars.length === 0) return null;

    const vwapValue = vwap(bars);
    if (!vwapValue) return null;

    // Calculate standard deviation of price from VWAP
    let sumSquaredDiff = 0;
    for (const bar of bars) {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        sumSquaredDiff += Math.pow(typicalPrice - vwapValue, 2);
    }
    const stdDev = Math.sqrt(sumSquaredDiff / bars.length);

    return {
        vwap: vwapValue,
        upper: vwapValue + 2 * stdDev,
        lower: vwapValue - 2 * stdDev,
    };
}

/**
 * Relative Strength Index (RSI)
 * 
 * RSI = 100 - (100 / (1 + RS))
 * RS = Average Gain / Average Loss
 */
export function rsi(bars: Bar[], period: number = 14): number | null {
    if (bars.length < period + 1) return null;

    const changes: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        changes.push(bars[i].close - bars[i - 1].close);
    }

    // Calculate initial average gain and loss
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) {
            avgGain += changes[i];
        } else {
            avgLoss += Math.abs(changes[i]);
        }
    }

    avgGain /= period;
    avgLoss /= period;

    // Smooth with subsequent values
    for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
        }
    }

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * MACD (Moving Average Convergence Divergence)
 * 
 * MACD Line = 12-period EMA - 26-period EMA
 * Signal Line = 9-period EMA of MACD Line
 * Histogram = MACD Line - Signal Line
 */
export function macd(bars: Bar[]): { macd: number; signal: number; histogram: number } | null {
    if (bars.length < 26) return null;

    const ema12 = ema(bars, 12);
    const ema26 = ema(bars, 26);

    if (!ema12 || !ema26) return null;

    const macdLine = ema12 - ema26;

    // Calculate signal line (9-period EMA of MACD values)
    // For simplicity, approximate with recent MACD
    const macdValues: number[] = [];
    for (let i = 26; i <= bars.length; i++) {
        const slice = bars.slice(0, i);
        const e12 = ema(slice, 12);
        const e26 = ema(slice, 26);
        if (e12 && e26) {
            macdValues.push(e12 - e26);
        }
    }

    if (macdValues.length < 9) {
        return { macd: macdLine, signal: macdLine, histogram: 0 };
    }

    // EMA of MACD values
    const multiplier = 2 / 10; // 9-period
    let signalLine = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdValues.length; i++) {
        signalLine = (macdValues[i] - signalLine) * multiplier + signalLine;
    }

    return {
        macd: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine,
    };
}

/**
 * Average True Range (ATR)
 * 
 * True Range = max(High - Low, |High - Previous Close|, |Low - Previous Close|)
 * ATR = SMA of True Range
 */
export function atr(bars: Bar[], period: number = 14): number | null {
    if (bars.length < period + 1) return null;

    const trueRanges: number[] = [];

    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].high;
        const low = bars[i].low;
        const prevClose = bars[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }

    // Calculate ATR as SMA of last 'period' true ranges
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / period;
}

/**
 * Bollinger Bands
 * 
 * Middle = 20-period SMA
 * Upper = Middle + 2 * StdDev
 * Lower = Middle - 2 * StdDev
 */
export function bollingerBands(bars: Bar[], period: number = 20, stdDevMultiplier: number = 2): {
    upper: number;
    middle: number;
    lower: number;
    width: number;
    percentB: number;
} | null {
    if (bars.length < period) return null;

    const slice = bars.slice(-period);
    const middle = slice.reduce((sum, b) => sum + b.close, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = slice.map(b => Math.pow(b.close - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = middle + stdDevMultiplier * stdDev;
    const lower = middle - stdDevMultiplier * stdDev;
    const width = (upper - lower) / middle;

    const currentPrice = bars[bars.length - 1].close;
    const percentB = (currentPrice - lower) / (upper - lower);

    return { upper, middle, lower, width, percentB };
}

/**
 * Support and Resistance Levels
 * 
 * Finds significant price levels based on:
 * - Previous swing highs and lows
 * - Volume clusters
 * - Round numbers
 */
export function findSupportResistance(bars: Bar[], lookback: number = 50): {
    supports: number[];
    resistances: number[];
    nearest: { support: number | null; resistance: number | null };
} {
    if (bars.length < lookback) {
        return { supports: [], resistances: [], nearest: { support: null, resistance: null } };
    }

    const recentBars = bars.slice(-lookback);
    const currentPrice = bars[bars.length - 1].close;

    // Find swing highs and lows
    const swingHighs: number[] = [];
    const swingLows: number[] = [];

    for (let i = 2; i < recentBars.length - 2; i++) {
        const bar = recentBars[i];
        const prevBars = [recentBars[i - 2], recentBars[i - 1]];
        const nextBars = [recentBars[i + 1], recentBars[i + 2]];

        // Swing high: higher than 2 bars on each side
        if (prevBars.every(b => bar.high > b.high) && nextBars.every(b => bar.high > b.high)) {
            swingHighs.push(bar.high);
        }

        // Swing low: lower than 2 bars on each side
        if (prevBars.every(b => bar.low < b.low) && nextBars.every(b => bar.low < b.low)) {
            swingLows.push(bar.low);
        }
    }

    // Cluster nearby levels (within 0.5%)
    const clusterLevels = (levels: number[]): number[] => {
        const clustered: number[] = [];
        const sorted = [...levels].sort((a, b) => a - b);

        let i = 0;
        while (i < sorted.length) {
            let j = i;
            let sum = 0;
            let count = 0;

            // Group levels within 0.5%
            while (j < sorted.length && (sorted[j] - sorted[i]) / sorted[i] < 0.005) {
                sum += sorted[j];
                count++;
                j++;
            }

            clustered.push(sum / count);
            i = j;
        }

        return clustered;
    };

    const resistances = clusterLevels(swingHighs)
        .filter(r => r > currentPrice)
        .slice(0, 3);

    const supports = clusterLevels(swingLows)
        .filter(s => s < currentPrice)
        .slice(-3);

    return {
        supports,
        resistances,
        nearest: {
            support: supports.length > 0 ? Math.max(...supports) : null,
            resistance: resistances.length > 0 ? Math.min(...resistances) : null,
        },
    };
}

/**
 * Volume Analysis
 * 
 * Compares current volume to average
 */
export function volumeAnalysis(bars: Bar[], period: number = 20): {
    current: number;
    average: number;
    ratio: number;
    isHigh: boolean;
    isLow: boolean;
} | null {
    if (bars.length < period) return null;

    const current = bars[bars.length - 1].volume;
    const avgVolume = bars.slice(-period).reduce((sum, b) => sum + b.volume, 0) / period;
    const ratio = current / avgVolume;

    return {
        current,
        average: avgVolume,
        ratio,
        isHigh: ratio > 1.5,
        isLow: ratio < 0.5,
    };
}

/**
 * Momentum (Rate of Change)
 * 
 * ROC = ((Current Price - Price N periods ago) / Price N periods ago) * 100
 */
export function momentum(bars: Bar[], period: number = 10): number | null {
    if (bars.length < period + 1) return null;

    const currentPrice = bars[bars.length - 1].close;
    const pastPrice = bars[bars.length - 1 - period].close;

    return ((currentPrice - pastPrice) / pastPrice) * 100;
}

/**
 * Trend Direction
 * 
 * Uses multiple moving averages to determine trend
 */
export function trendDirection(bars: Bar[]): {
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    sma20: number | null;
    sma50: number | null;
    ema9: number | null;
} {
    const sma20Value = sma(bars, 20);
    const sma50Value = sma(bars, 50);
    const ema9Value = ema(bars, 9);

    if (!sma20Value || !sma50Value || !ema9Value) {
        return { direction: 'neutral', strength: 0, sma20: null, sma50: null, ema9: null };
    }

    const currentPrice = bars[bars.length - 1].close;

    let bullishSignals = 0;
    let bearishSignals = 0;

    // Price above/below MAs
    if (currentPrice > sma20Value) bullishSignals++; else bearishSignals++;
    if (currentPrice > sma50Value) bullishSignals++; else bearishSignals++;
    if (currentPrice > ema9Value) bullishSignals++; else bearishSignals++;

    // MA alignment
    if (ema9Value > sma20Value) bullishSignals++; else bearishSignals++;
    if (sma20Value > sma50Value) bullishSignals++; else bearishSignals++;

    const totalSignals = bullishSignals + bearishSignals;
    const strength = Math.abs(bullishSignals - bearishSignals) / totalSignals;

    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullishSignals > bearishSignals + 1) direction = 'bullish';
    else if (bearishSignals > bullishSignals + 1) direction = 'bearish';

    return { direction, strength, sma20: sma20Value, sma50: sma50Value, ema9: ema9Value };
}

/**
 * Generate comprehensive technical analysis
 */
export function fullAnalysis(bars: Bar[]): {
    price: number;
    vwap: ReturnType<typeof vwapWithBands>;
    rsi: number | null;
    macd: ReturnType<typeof macd>;
    atr: number | null;
    bollinger: ReturnType<typeof bollingerBands>;
    levels: ReturnType<typeof findSupportResistance>;
    volume: ReturnType<typeof volumeAnalysis>;
    momentum: number | null;
    trend: ReturnType<typeof trendDirection>;
} {
    return {
        price: bars.length > 0 ? bars[bars.length - 1].close : 0,
        vwap: vwapWithBands(bars),
        rsi: rsi(bars),
        macd: macd(bars),
        atr: atr(bars),
        bollinger: bollingerBands(bars),
        levels: findSupportResistance(bars),
        volume: volumeAnalysis(bars),
        momentum: momentum(bars),
        trend: trendDirection(bars),
    };
}
