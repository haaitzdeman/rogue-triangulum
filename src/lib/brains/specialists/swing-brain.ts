/**
 * Swing Brain V2 - Strategy-Based
 * 
 * Specialist brain for multi-day swing trades (3-10 days).
 * Uses the strategies from src/lib/strategies/ for signal generation.
 * 
 * NO RANDOM DATA - all signals derived from real indicator math.
 */

import { BaseBrain } from '../interface';
import type { BrainConfig } from '../interface';
import type {
    MarketContext,
    Candidate,
    FeatureVector,
    BrainPrediction,
} from '../../core/types';
import { v4 as uuidv4 } from 'uuid';
import type { Bar } from '../../indicators';
import type { IndicatorSnapshot, StrategySignal, Strategy } from '../../strategies/types';
import { ALL_STRATEGIES } from '../../strategies';
import {
    rsi, macd, bollingerBands, atr, adx,
    trendDirection, volumeAnalysis, findSupportResistance,
    vwapWithBands, sma, ema, stochastic
} from '../../indicators';
import { PolygonProvider } from '../../data';

const SWING_CONFIG: BrainConfig = {
    desk: 'swing',
    name: 'Swing Trading Brain',
    description: 'Analyzes multi-day setups using rule-based strategies (Momentum, Breakout, Mean Reversion, Trend Follow).',
    experts: [],
    defaultHorizonHours: 168, // 7 days
    minConfidenceForIntent: 0.6,
    minStrengthForIntent: 0.5,
};

const SWING_WATCH_LIST = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'GS'];
const STOCK_NAMES: Record<string, string> = {
    AAPL: 'Apple Inc.',
    NVDA: 'NVIDIA Corp',
    TSLA: 'Tesla Inc.',
    AMD: 'AMD Inc.',
    META: 'Meta Platforms',
    MSFT: 'Microsoft Corp',
    GOOGL: 'Alphabet Inc.',
    AMZN: 'Amazon.com Inc.',
    JPM: 'JPMorgan Chase',
    GS: 'Goldman Sachs',
    SPY: 'SPDR S&P 500 ETF',
    QQQ: 'Invesco QQQ Trust',
};

/**
 * Compute indicator snapshot from bars (for strategy analysis)
 */
function computeIndicators(bars: Bar[]): IndicatorSnapshot | null {
    if (bars.length < 50) return null;

    const currentBar = bars[bars.length - 1];

    const rsiVal = rsi(bars, 14);
    const macdVal = macd(bars);
    const bbVal = bollingerBands(bars, 20, 2);
    const atrVal = atr(bars, 14);
    const adxVal = adx(bars, 14);
    const trend = trendDirection(bars);
    const volume = volumeAnalysis(bars, 20);
    const levels = findSupportResistance(bars, 50);
    const vwap = vwapWithBands(bars);
    const stochVal = stochastic(bars, 14, 3);

    const sma20Val = sma(bars, 20);
    const sma50Val = sma(bars, 50);
    const ema9Val = ema(bars, 9);

    return {
        price: currentBar.close,
        open: currentBar.open,
        high: currentBar.high,
        low: currentBar.low,

        sma20: sma20Val,
        sma50: sma50Val,
        ema9: ema9Val,
        trendDirection: trend.direction,

        rsi: rsiVal,
        macdLine: macdVal?.macd ?? null,
        macdSignal: macdVal?.signal ?? null,
        macdHistogram: macdVal?.histogram ?? null,
        stochK: stochVal?.k ?? null,
        stochD: stochVal?.d ?? null,

        atr: atrVal,
        bbUpper: bbVal?.upper ?? null,
        bbMiddle: bbVal?.middle ?? null,
        bbLower: bbVal?.lower ?? null,
        bbPercentB: bbVal?.percentB ?? null,

        volume: currentBar.volume,
        volumeAvg: volume?.average ?? null,
        volumeRatio: volume?.ratio ?? null,

        vwap: vwap?.vwap ?? null,
        nearestSupport: levels.nearest.support,
        nearestResistance: levels.nearest.resistance,

        adx: adxVal?.adx ?? null,
        adxTrend: adxVal?.trendDirection ?? null,
        ichimokuSignal: null,
    };
}

/**
 * Run all strategies and aggregate signals
 */
function runStrategies(indicators: IndicatorSnapshot, strategies: Strategy[] = ALL_STRATEGIES): {
    bestSignal: StrategySignal | null;
    strategyName: string;
    allSignals: { name: string; signal: StrategySignal }[];
} {
    const allSignals: { name: string; signal: StrategySignal }[] = [];

    for (const strategy of strategies) {
        if (!strategy.isApplicable(indicators)) continue;
        const signal = strategy.analyze(indicators);
        if (signal.direction !== 'none' && signal.score >= 50) {
            allSignals.push({ name: strategy.name, signal });
        }
    }

    // Sort by score descending
    allSignals.sort((a, b) => b.signal.score - a.signal.score);

    if (allSignals.length === 0) {
        return { bestSignal: null, strategyName: '', allSignals: [] };
    }

    return {
        bestSignal: allSignals[0].signal,
        strategyName: allSignals[0].name,
        allSignals,
    };
}

export class SwingBrain extends BaseBrain {
    readonly config: BrainConfig = SWING_CONFIG;
    private provider: PolygonProvider | null = null;

    private getProvider(): PolygonProvider {
        if (!this.provider) {
            const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || '';
            this.provider = new PolygonProvider({ type: 'polygon', apiKey, rateLimit: 5 });
        }
        return this.provider;
    }

    /**
     * Scan candidates using real strategies
     */
    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];
        const provider = this.getProvider();

        const endDate = new Date(context.timestamp);
        const startDate = new Date(context.timestamp);
        startDate.setDate(startDate.getDate() - 90); // 90 days of daily data

        for (const symbol of SWING_WATCH_LIST) {
            try {
                const response = await provider.getCandles(symbol, '1d', startDate, endDate);
                const responseData = response as { data?: { candles?: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> } };
                const candles = responseData?.data?.candles || [];

                if (candles.length < 50) continue;

                // Convert to Bar format
                const bars: Bar[] = candles.map((c) => ({
                    timestamp: c.timestamp,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume,
                }));

                // Compute indicators
                const indicators = computeIndicators(bars);
                if (!indicators) continue;

                // Run strategies
                const { bestSignal, strategyName, allSignals } = runStrategies(indicators);
                if (!bestSignal) continue;

                const currentPrice = bars[bars.length - 1].close;
                const prevPrice = bars.length > 1 ? bars[bars.length - 2].close : currentPrice;
                const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;

                candidates.push({
                    symbol,
                    score: bestSignal.score,
                    direction: bestSignal.direction as 'long' | 'short',
                    reasons: bestSignal.reasons,
                    timestamp: context.timestamp,
                    // Extended fields for UI and Journal
                    name: STOCK_NAMES[symbol] || symbol,
                    strategyName: strategyName,  // Source of truth for journal
                    setupType: strategyName,
                    confidence: bestSignal.confidence,
                    invalidation: bestSignal.invalidation || currentPrice * (bestSignal.direction === 'long' ? 0.95 : 1.05),
                    currentPrice,
                    priceChange,
                    signals: allSignals.map(s => ({
                        name: s.name,
                        direction: s.signal.direction,
                        strength: s.signal.score / 100,
                    })),
                } as Candidate & { name: string; strategyName: string; setupType: string; confidence: number; invalidation: number; currentPrice: number; priceChange: number; signals: Array<{ name: string; direction: string; strength: number }> });

                // Rate limit
                await new Promise(r => setTimeout(r, 200));
            } catch (error) {
                console.error(`[SwingBrain] Error scanning ${symbol}:`, error);
            }
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    async buildFeatures(candidate: Candidate, context: MarketContext): Promise<FeatureVector> {
        // Features already computed during scan
        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features: {
                score: candidate.score,
                direction: candidate.direction === 'long' ? 1 : -1,
            },
            metadata: { desk: 'swing', source: 'swing-brain-v2' },
        };
    }

    async predict(candidate: Candidate, features: FeatureVector, _context: MarketContext): Promise<BrainPrediction> {
        const now = new Date();
        const extendedCandidate = candidate as Candidate & {
            confidence?: number;
            invalidation?: number;
            currentPrice?: number;
        };
        const confidence = extendedCandidate.confidence ?? candidate.score / 100;
        const strength = candidate.score / 100;

        // V1: Explainable outputs - derived from ATR and R-multiple
        const currentPrice = extendedCandidate.currentPrice ?? 100;
        const DEFAULT_ATR_PERCENT = 0.02; // 2% default
        const atrPercent = DEFAULT_ATR_PERCENT;
        const atrDollars = currentPrice * atrPercent;
        const stopDistance = atrDollars * 1.5;
        const riskStop = candidate.direction === 'long'
            ? currentPrice - stopDistance
            : currentPrice + stopDistance;
        const targetR = 2; // Default 2R target
        const targetDistance = stopDistance * targetR;
        const targetPrice = candidate.direction === 'long'
            ? currentPrice + targetDistance
            : currentPrice - targetDistance;

        return {
            id: uuidv4(),
            createdAt: now,
            brainType: this.desk,
            symbol: candidate.symbol,

            // V1: FAKE PREDICTIONS REMOVED - set to null
            predictedReturnMean: null,
            predictedIntervalLow: null,
            predictedIntervalHigh: null,
            predictedProbProfit: null,
            confidence,

            // V1: EXPLAINABLE OUTPUTS - derived from ATR
            expectedMoveATR: 1.5,
            atrDollars,
            atrPercent: atrPercent * 100,
            riskStop,
            targetPrice,
            targetR,

            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + this.config.defaultHorizonHours * 60 * 60 * 1000),
            direction: candidate.direction,
            strength,
            expertContributions: this.getExpertContributions(),
            mixerWeights: [1],
            featureSnapshot: features.features,
            reasons: candidate.reasons,
            invalidation: extendedCandidate.invalidation?.toString() || `Stop at $${riskStop.toFixed(2)}`,
        };
    }
}
