/**
 * Extended Technical Indicators
 * 
 * Additional indicators for improved accuracy.
 */

import type { Bar } from './technical';
import { ema } from './technical';

/**
 * Stochastic Oscillator
 * 
 * %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) * 100
 * %D = 3-period SMA of %K
 */
export function stochastic(bars: Bar[], kPeriod: number = 14, dPeriod: number = 3): {
    k: number;
    d: number;
    signal: 'overbought' | 'oversold' | 'neutral';
} | null {
    if (bars.length < kPeriod + dPeriod) return null;

    const kValues: number[] = [];

    for (let i = kPeriod - 1; i < bars.length; i++) {
        const slice = bars.slice(i - kPeriod + 1, i + 1);
        const lowestLow = Math.min(...slice.map(b => b.low));
        const highestHigh = Math.max(...slice.map(b => b.high));
        const currentClose = bars[i].close;

        if (highestHigh === lowestLow) {
            kValues.push(50);
        } else {
            kValues.push(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100);
        }
    }

    // Current %K
    const k = kValues[kValues.length - 1];

    // %D is 3-period SMA of %K
    const recentK = kValues.slice(-dPeriod);
    const d = recentK.reduce((a, b) => a + b, 0) / dPeriod;

    // Signal
    let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
    if (k > 80 && d > 80) signal = 'overbought';
    else if (k < 20 && d < 20) signal = 'oversold';

    return { k, d, signal };
}

/**
 * Average Directional Index (ADX)
 * 
 * Measures trend strength (not direction).
 * ADX > 25 = strong trend
 * ADX < 20 = weak/no trend
 */
export function adx(bars: Bar[], period: number = 14): {
    adx: number;
    plusDI: number;
    minusDI: number;
    trendStrength: 'strong' | 'moderate' | 'weak' | 'none';
    trendDirection: 'up' | 'down' | 'ranging';
} | null {
    if (bars.length < period * 2) return null;

    const trueRanges: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].high;
        const low = bars[i].low;
        const prevHigh = bars[i - 1].high;
        const prevLow = bars[i - 1].low;
        const prevClose = bars[i - 1].close;

        // True Range
        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);

        // Directional Movement
        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smoothed averages
    const smoothTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
    const smoothPlusDM = plusDMs.slice(-period).reduce((a, b) => a + b, 0);
    const smoothMinusDM = minusDMs.slice(-period).reduce((a, b) => a + b, 0);

    // +DI and -DI
    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

    // DX
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

    // ADX (simplified - using single period)
    const adxValue = dx;

    // Interpret
    let trendStrength: 'strong' | 'moderate' | 'weak' | 'none' = 'none';
    if (adxValue >= 40) trendStrength = 'strong';
    else if (adxValue >= 25) trendStrength = 'moderate';
    else if (adxValue >= 15) trendStrength = 'weak';

    let trendDirection: 'up' | 'down' | 'ranging' = 'ranging';
    if (plusDI > minusDI && adxValue > 20) trendDirection = 'up';
    else if (minusDI > plusDI && adxValue > 20) trendDirection = 'down';

    return { adx: adxValue, plusDI, minusDI, trendStrength, trendDirection };
}

/**
 * Williams %R
 * 
 * Similar to Stochastic but inverted.
 * -20 to 0 = overbought
 * -100 to -80 = oversold
 */
export function williamsR(bars: Bar[], period: number = 14): {
    value: number;
    signal: 'overbought' | 'oversold' | 'neutral';
} | null {
    if (bars.length < period) return null;

    const slice = bars.slice(-period);
    const highestHigh = Math.max(...slice.map(b => b.high));
    const lowestLow = Math.min(...slice.map(b => b.low));
    const currentClose = bars[bars.length - 1].close;

    if (highestHigh === lowestLow) return { value: -50, signal: 'neutral' };

    const value = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;

    let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
    if (value > -20) signal = 'overbought';
    else if (value < -80) signal = 'oversold';

    return { value, signal };
}

/**
 * Commodity Channel Index (CCI)
 * 
 * Measures price deviation from average.
 * CCI > 100 = overbought
 * CCI < -100 = oversold
 */
export function cci(bars: Bar[], period: number = 20): {
    value: number;
    signal: 'overbought' | 'oversold' | 'neutral';
} | null {
    if (bars.length < period) return null;

    const slice = bars.slice(-period);

    // Typical prices
    const typicalPrices = slice.map(b => (b.high + b.low + b.close) / 3);
    const smaTP = typicalPrices.reduce((a, b) => a + b, 0) / period;

    // Mean deviation
    const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;

    if (meanDeviation === 0) return { value: 0, signal: 'neutral' };

    const currentTP = typicalPrices[typicalPrices.length - 1];
    const value = (currentTP - smaTP) / (0.015 * meanDeviation);

    let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
    if (value > 100) signal = 'overbought';
    else if (value < -100) signal = 'oversold';

    return { value, signal };
}

/**
 * On-Balance Volume (OBV)
 * 
 * Cumulative volume indicator.
 * Rising OBV = accumulation
 * Falling OBV = distribution
 */
export function obv(bars: Bar[]): {
    current: number;
    trend: 'rising' | 'falling' | 'flat';
    divergence: 'bullish' | 'bearish' | 'none';
} | null {
    if (bars.length < 20) return null;

    let obvValue = 0;
    const obvValues: number[] = [];

    for (let i = 1; i < bars.length; i++) {
        if (bars[i].close > bars[i - 1].close) {
            obvValue += bars[i].volume;
        } else if (bars[i].close < bars[i - 1].close) {
            obvValue -= bars[i].volume;
        }
        obvValues.push(obvValue);
    }

    // Trend (compare last 5 to previous 5)
    const recent5 = obvValues.slice(-5);
    const prev5 = obvValues.slice(-10, -5);
    const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5;
    const prevAvg = prev5.reduce((a, b) => a + b, 0) / 5;

    let trend: 'rising' | 'falling' | 'flat' = 'flat';
    if (recentAvg > prevAvg * 1.05) trend = 'rising';
    else if (recentAvg < prevAvg * 0.95) trend = 'falling';

    // Divergence detection
    const recentPrices = bars.slice(-5).map(b => b.close);
    const prevPrices = bars.slice(-10, -5).map(b => b.close);
    const recentPriceAvg = recentPrices.reduce((a, b) => a + b, 0) / 5;
    const prevPriceAvg = prevPrices.reduce((a, b) => a + b, 0) / 5;
    const priceRising = recentPriceAvg > prevPriceAvg;

    let divergence: 'bullish' | 'bearish' | 'none' = 'none';
    if (trend === 'rising' && !priceRising) divergence = 'bullish';
    else if (trend === 'falling' && priceRising) divergence = 'bearish';

    return { current: obvValue, trend, divergence };
}

/**
 * Parabolic SAR
 * 
 * Stop and reverse indicator.
 * Provides trailing stop levels.
 */
export function parabolicSar(bars: Bar[], af: number = 0.02, maxAf: number = 0.2): {
    sar: number;
    trend: 'up' | 'down';
    reversal: boolean;
} | null {
    if (bars.length < 5) return null;

    let isUptrend = bars[1].close > bars[0].close;
    let sar = isUptrend ? bars[0].low : bars[0].high;
    let ep = isUptrend ? bars[0].high : bars[0].low;
    let acceleration = af;

    for (let i = 2; i < bars.length; i++) {
        const prevSar = sar;

        // Calculate new SAR
        sar = prevSar + acceleration * (ep - prevSar);

        // Ensure SAR doesn't go beyond prior bars
        if (isUptrend) {
            sar = Math.min(sar, bars[i - 1].low, bars[i - 2].low);
        } else {
            sar = Math.max(sar, bars[i - 1].high, bars[i - 2].high);
        }

        // Check for reversal
        let reversed = false;
        if (isUptrend && bars[i].low < sar) {
            isUptrend = false;
            sar = ep;
            ep = bars[i].low;
            acceleration = af;
            reversed = true;
        } else if (!isUptrend && bars[i].high > sar) {
            isUptrend = true;
            sar = ep;
            ep = bars[i].high;
            acceleration = af;
            reversed = true;
        }

        if (!reversed) {
            // Update EP and acceleration
            if (isUptrend && bars[i].high > ep) {
                ep = bars[i].high;
                acceleration = Math.min(acceleration + af, maxAf);
            } else if (!isUptrend && bars[i].low < ep) {
                ep = bars[i].low;
                acceleration = Math.min(acceleration + af, maxAf);
            }
        }
    }

    // Check if current bar is near reversal
    const lastBar = bars[bars.length - 1];
    const reversal = isUptrend
        ? (lastBar.low - sar) / lastBar.close < 0.01
        : (sar - lastBar.high) / lastBar.close < 0.01;

    return { sar, trend: isUptrend ? 'up' : 'down', reversal };
}

/**
 * Price Rate of Change (ROC)
 * 
 * Percentage change over N periods.
 */
export function roc(bars: Bar[], period: number = 12): number | null {
    if (bars.length < period + 1) return null;

    const currentClose = bars[bars.length - 1].close;
    const pastClose = bars[bars.length - 1 - period].close;

    return ((currentClose - pastClose) / pastClose) * 100;
}

/**
 * Money Flow Index (MFI)
 * 
 * Volume-weighted RSI.
 * MFI > 80 = overbought
 * MFI < 20 = oversold
 */
export function mfi(bars: Bar[], period: number = 14): {
    value: number;
    signal: 'overbought' | 'oversold' | 'neutral';
} | null {
    if (bars.length < period + 1) return null;

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = bars.length - period; i < bars.length; i++) {
        const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
        const prevTypicalPrice = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
        const moneyFlow = typicalPrice * bars[i].volume;

        if (typicalPrice > prevTypicalPrice) {
            positiveFlow += moneyFlow;
        } else {
            negativeFlow += moneyFlow;
        }
    }

    if (negativeFlow === 0) return { value: 100, signal: 'overbought' };

    const moneyRatio = positiveFlow / negativeFlow;
    const mfiValue = 100 - (100 / (1 + moneyRatio));

    let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
    if (mfiValue > 80) signal = 'overbought';
    else if (mfiValue < 20) signal = 'oversold';

    return { value: mfiValue, signal };
}

/**
 * Keltner Channels
 * 
 * EMA-based channels using ATR.
 */
export function keltnerChannels(bars: Bar[], period: number = 20, multiplier: number = 2): {
    upper: number;
    middle: number;
    lower: number;
    position: 'above' | 'below' | 'inside';
} | null {
    if (bars.length < period) return null;

    const emaValue = ema(bars, period);
    if (!emaValue) return null;

    // Calculate ATR
    let atrSum = 0;
    for (let i = bars.length - period; i < bars.length; i++) {
        if (i === 0) continue;
        const tr = Math.max(
            bars[i].high - bars[i].low,
            Math.abs(bars[i].high - bars[i - 1].close),
            Math.abs(bars[i].low - bars[i - 1].close)
        );
        atrSum += tr;
    }
    const atrValue = atrSum / period;

    const upper = emaValue + multiplier * atrValue;
    const lower = emaValue - multiplier * atrValue;
    const currentPrice = bars[bars.length - 1].close;

    let position: 'above' | 'below' | 'inside' = 'inside';
    if (currentPrice > upper) position = 'above';
    else if (currentPrice < lower) position = 'below';

    return { upper, middle: emaValue, lower, position };
}

/**
 * Ichimoku Cloud (simplified)
 */
export function ichimoku(bars: Bar[]): {
    tenkan: number;
    kijun: number;
    senkouA: number;
    senkouB: number;
    signal: 'bullish' | 'bearish' | 'neutral';
    cloudColor: 'green' | 'red';
    priceVsCloud: 'above' | 'below' | 'inside';
} | null {
    if (bars.length < 52) return null;

    // Tenkan-sen (9-period)
    const tenkan9 = bars.slice(-9);
    const tenkan = (Math.max(...tenkan9.map(b => b.high)) + Math.min(...tenkan9.map(b => b.low))) / 2;

    // Kijun-sen (26-period)
    const kijun26 = bars.slice(-26);
    const kijun = (Math.max(...kijun26.map(b => b.high)) + Math.min(...kijun26.map(b => b.low))) / 2;

    // Senkou Span A (average of Tenkan and Kijun)
    const senkouA = (tenkan + kijun) / 2;

    // Senkou Span B (52-period)
    const senkou52 = bars.slice(-52);
    const senkouB = (Math.max(...senkou52.map(b => b.high)) + Math.min(...senkou52.map(b => b.low))) / 2;

    const currentPrice = bars[bars.length - 1].close;
    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBottom = Math.min(senkouA, senkouB);

    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (tenkan > kijun && currentPrice > cloudTop) signal = 'bullish';
    else if (tenkan < kijun && currentPrice < cloudBottom) signal = 'bearish';

    const cloudColor = senkouA > senkouB ? 'green' : 'red';

    let priceVsCloud: 'above' | 'below' | 'inside' = 'inside';
    if (currentPrice > cloudTop) priceVsCloud = 'above';
    else if (currentPrice < cloudBottom) priceVsCloud = 'below';

    return { tenkan, kijun, senkouA, senkouB, signal, cloudColor, priceVsCloud };
}
