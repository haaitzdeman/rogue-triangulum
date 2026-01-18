/**
 * Smart Day Trading Brain
 * 
 * Uses REAL technical indicators for predictions.
 * Designed for backtesting and simulation with historical data.
 */

import { BaseBrain } from '../interface';
import type { BrainConfig, ExpertOutput } from '../interface';
import type {
    MarketContext,
    Candidate,
    FeatureVector,
    BrainPrediction,
} from '../../core/types';
import { v4 as uuidv4 } from 'uuid';
import {
    vwapWithBands,
    rsi,
    macd,
    volumeAnalysis,
    findSupportResistance,
    trendDirection,
    momentum,
    atr,
    type Bar,
} from '../../indicators';

/**
 * Smart Day Trading Brain Configuration
 */
const SMART_DAY_TRADING_CONFIG: BrainConfig = {
    desk: 'day-trading',
    name: 'Smart Day Trading Brain',
    description: 'Uses real technical indicators: VWAP, RSI, MACD, Support/Resistance, Volume.',
    experts: [],
    defaultHorizonHours: 24, // 1 day horizon for daily simulation
    minConfidenceForIntent: 0.65,
    minStrengthForIntent: 0.6,
};

/**
 * Smart Day Trading Brain Implementation
 */
export class SmartDayTradingBrain extends BaseBrain {
    readonly config: BrainConfig = SMART_DAY_TRADING_CONFIG;

    // Historical bars for indicator calculation
    private historicalBars: Map<string, Bar[]> = new Map();

    /**
     * Feed historical data for a symbol
     */
    feedHistoricalData(symbol: string, bars: Bar[]): void {
        this.historicalBars.set(symbol, bars);
    }

    /**
     * Clear historical data
     */
    clearData(): void {
        this.historicalBars.clear();
    }

    /**
     * Scan for candidates (requires historical data to be fed first)
     */
    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];

        for (const [symbol, bars] of Array.from(this.historicalBars.entries())) {
            if (bars.length < 50) continue;

            // Get real technical analysis
            const trend = trendDirection(bars);
            const rsiValue = rsi(bars);
            const vol = volumeAnalysis(bars);

            // Score based on real signals
            let score = 50;
            const reasons: string[] = [];
            let direction: 'long' | 'short' | 'neutral' = 'neutral';

            // Trend alignment
            if (trend.direction === 'bullish') {
                score += 15;
                direction = 'long';
                reasons.push('Trend is bullish (price above MAs)');
            } else if (trend.direction === 'bearish') {
                score += 15;
                direction = 'short';
                reasons.push('Trend is bearish (price below MAs)');
            }

            // RSI signals
            if (rsiValue !== null) {
                if (rsiValue < 30) {
                    score += 10;
                    if (direction !== 'short') {
                        direction = 'long';
                        reasons.push(`RSI oversold at ${rsiValue.toFixed(1)}`);
                    }
                } else if (rsiValue > 70) {
                    score += 10;
                    if (direction !== 'long') {
                        direction = 'short';
                        reasons.push(`RSI overbought at ${rsiValue.toFixed(1)}`);
                    }
                }
            }

            // Volume confirmation
            if (vol?.isHigh) {
                score += 10;
                reasons.push('High volume confirms move');
            }

            if (reasons.length === 0) {
                reasons.push('No strong signals');
            }

            candidates.push({
                symbol,
                score: Math.min(100, score),
                direction,
                reasons,
                timestamp: context.timestamp,
            });
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Build feature vector using REAL indicators
     */
    async buildFeatures(
        candidate: Candidate,
        context: MarketContext
    ): Promise<FeatureVector> {
        const bars = this.historicalBars.get(candidate.symbol) || [];

        // Calculate real indicators
        const rsiValue = rsi(bars) || 50;
        const macdResult = macd(bars);
        const vwapResult = vwapWithBands(bars);
        const volResult = volumeAnalysis(bars);
        const trend = trendDirection(bars);
        const levels = findSupportResistance(bars);
        const mom = momentum(bars) || 0;
        const atrValue = atr(bars) || 0;

        const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;

        // Build real features
        const features: Record<string, number> = {
            // VWAP features
            vwap_value: vwapResult?.vwap || currentPrice,
            price_vs_vwap: vwapResult ? (currentPrice - vwapResult.vwap) / vwapResult.vwap : 0,
            vwap_band_position: vwapResult ?
                (currentPrice - vwapResult.lower) / (vwapResult.upper - vwapResult.lower) : 0.5,

            // RSI
            rsi_14: rsiValue,
            rsi_oversold: rsiValue < 30 ? 1 : 0,
            rsi_overbought: rsiValue > 70 ? 1 : 0,

            // MACD
            macd_value: macdResult?.macd || 0,
            macd_signal: macdResult?.signal || 0,
            macd_histogram: macdResult?.histogram || 0,
            macd_bullish: macdResult && macdResult.histogram > 0 ? 1 : 0,

            // Volume
            rvol: volResult?.ratio || 1,
            volume_high: volResult?.isHigh ? 1 : 0,
            volume_low: volResult?.isLow ? 1 : 0,

            // Momentum
            momentum_10: mom,
            momentum_positive: mom > 0 ? 1 : 0,

            // ATR (volatility)
            atr_14: atrValue,
            atr_percent: currentPrice > 0 ? atrValue / currentPrice : 0,

            // Trend
            trend_bullish: trend.direction === 'bullish' ? 1 : 0,
            trend_bearish: trend.direction === 'bearish' ? 1 : 0,
            trend_strength: trend.strength,

            // Levels
            distance_to_resistance: levels.nearest.resistance
                ? (levels.nearest.resistance - currentPrice) / currentPrice : 0.1,
            distance_to_support: levels.nearest.support
                ? (currentPrice - levels.nearest.support) / currentPrice : 0.1,

            // Context
            market_regime: context.marketRegime === 'risk-on' ? 1 :
                context.marketRegime === 'risk-off' ? -1 : 0,
        };

        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features,
            metadata: {
                desk: 'day-trading',
                source: 'smart-day-trading-brain',
            },
        };
    }

    /**
     * Generate prediction using REAL expert analysis
     */
    async predict(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<BrainPrediction> {
        // Run experts with REAL logic
        this.expertOutputs = await this.runSmartExperts(candidate, features, context);

        // Apply mixer
        this.mixerWeights = this.normalizeWeights(
            this.expertOutputs.map(e => e.confidenceComponent)
        );

        // Combine expert outputs
        let totalReturn = 0;
        let totalConfidence = 0;
        let longVotes = 0;
        let shortVotes = 0;
        const reasons: string[] = [];
        const warnings: string[] = [];

        for (let i = 0; i < this.expertOutputs.length; i++) {
            const output = this.expertOutputs[i];
            const weight = this.mixerWeights[i];

            totalReturn += output.predictedReturnComponent * weight;
            totalConfidence += output.confidenceComponent * weight;

            if (output.direction === 'long' && output.confidenceComponent > 0.5) longVotes++;
            else if (output.direction === 'short' && output.confidenceComponent > 0.5) shortVotes++;

            if (output.explanationTokens.length > 0 && output.confidenceComponent > 0.5) {
                reasons.push(`${output.expertName}: ${output.explanationTokens[0]}`);
            }

            // Add warnings for conflicting signals
            if (output.confidenceComponent < 0.4) {
                warnings.push(`${output.expertName} has weak signal`);
            }
        }

        // Determine direction - require clear majority
        let direction: 'long' | 'short' | 'neutral' = 'neutral';
        if (longVotes >= 3 && longVotes > shortVotes) {
            direction = 'long';
        } else if (shortVotes >= 3 && shortVotes > longVotes) {
            direction = 'short';
        }

        // Adjust confidence based on expert agreement
        const agreement = Math.abs(longVotes - shortVotes) / this.expertOutputs.length;
        totalConfidence *= (0.5 + 0.5 * agreement); // Reduce confidence if experts disagree

        // Calculate prediction interval based on ATR
        const atrPercent = features.features.atr_percent || 0.02;
        const intervalWidth = atrPercent * 1.5;

        // Estimate return based on momentum and trend
        const expectedReturn = direction === 'neutral' ? 0 :
            direction === 'long' ?
                Math.abs(totalReturn) + features.features.momentum_10 / 200 :
                -Math.abs(totalReturn) - features.features.momentum_10 / 200;

        const now = new Date();
        const horizonMs = this.config.defaultHorizonHours * 60 * 60 * 1000;

        // Build invalidation reason
        let invalidation: string | undefined;
        if (direction === 'long') {
            const supportLevel = features.features.distance_to_support;
            invalidation = `Price drops more than ${(supportLevel * 100).toFixed(1)}% below support`;
        } else if (direction === 'short') {
            const resistanceLevel = features.features.distance_to_resistance;
            invalidation = `Price rises more than ${(resistanceLevel * 100).toFixed(1)}% above resistance`;
        }

        return {
            id: uuidv4(),
            createdAt: now,
            brainType: this.desk,
            symbol: candidate.symbol,

            predictedReturnMean: expectedReturn,
            predictedIntervalLow: expectedReturn - intervalWidth,
            predictedIntervalHigh: expectedReturn + intervalWidth,
            predictedProbProfit: direction === 'long' ?
                0.5 + totalConfidence * 0.3 :
                direction === 'short' ?
                    0.5 + totalConfidence * 0.3 :
                    0.5,
            confidence: totalConfidence,

            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + horizonMs),

            direction,
            strength: totalConfidence,

            expertContributions: this.getExpertContributions(),
            mixerWeights: this.mixerWeights,
            featureSnapshot: features.features,

            reasons,
            warnings: warnings.length > 0 ? warnings : undefined,
            invalidation,
        };
    }

    /**
     * Run REAL expert analysis
     */
    private async runSmartExperts(
        candidate: Candidate,
        features: FeatureVector,
        _context: MarketContext
    ): Promise<ExpertOutput[]> {
        const outputs: ExpertOutput[] = [];
        const f = features.features;

        // ========== VWAP Expert ==========
        // Uses real VWAP calculation
        const priceVsVwap = f.price_vs_vwap;
        const vwapBandPos = f.vwap_band_position;

        let vwapDirection: 'long' | 'short' | 'neutral' = 'neutral';
        let vwapConfidence = 0.4;
        let vwapExplanation = 'Price at VWAP';

        if (priceVsVwap > 0.01 && vwapBandPos > 0.6) {
            vwapDirection = 'long';
            vwapConfidence = 0.6 + Math.min(0.3, priceVsVwap * 10);
            vwapExplanation = `Price ${(priceVsVwap * 100).toFixed(2)}% above VWAP - bullish`;
        } else if (priceVsVwap < -0.01 && vwapBandPos < 0.4) {
            vwapDirection = 'short';
            vwapConfidence = 0.6 + Math.min(0.3, Math.abs(priceVsVwap) * 10);
            vwapExplanation = `Price ${(Math.abs(priceVsVwap) * 100).toFixed(2)}% below VWAP - bearish`;
        }

        outputs.push({
            expertName: 'VWAP',
            predictedReturnComponent: priceVsVwap * 0.5, // Expect reversion or continuation
            confidenceComponent: vwapConfidence,
            direction: vwapDirection,
            strength: Math.min(1, Math.abs(priceVsVwap) * 20),
            explanationTokens: [vwapExplanation],
            contributionVector: [priceVsVwap, vwapBandPos],
            timestamp: Date.now(),
        });

        // ========== Momentum Expert ==========
        // Uses RSI + MACD
        const rsiValue = f.rsi_14;
        const macdHistogram = f.macd_histogram;

        let momDirection: 'long' | 'short' | 'neutral' = 'neutral';
        let momConfidence = 0.4;
        let momExplanation = 'Momentum neutral';
        let momReturn = 0;

        // RSI oversold/overbought
        if (rsiValue < 30) {
            momDirection = 'long';
            momConfidence = 0.7;
            momReturn = 0.02; // Expect bounce
            momExplanation = `RSI oversold at ${rsiValue.toFixed(1)} - expect bounce`;
        } else if (rsiValue > 70) {
            momDirection = 'short';
            momConfidence = 0.7;
            momReturn = -0.02;
            momExplanation = `RSI overbought at ${rsiValue.toFixed(1)} - expect pullback`;
        } else if (rsiValue > 55 && macdHistogram > 0) {
            momDirection = 'long';
            momConfidence = 0.6;
            momReturn = 0.01;
            momExplanation = `Bullish momentum: RSI ${rsiValue.toFixed(1)}, MACD positive`;
        } else if (rsiValue < 45 && macdHistogram < 0) {
            momDirection = 'short';
            momConfidence = 0.6;
            momReturn = -0.01;
            momExplanation = `Bearish momentum: RSI ${rsiValue.toFixed(1)}, MACD negative`;
        }

        outputs.push({
            expertName: 'Momentum',
            predictedReturnComponent: momReturn,
            confidenceComponent: momConfidence,
            direction: momDirection,
            strength: Math.abs(rsiValue - 50) / 50,
            explanationTokens: [momExplanation],
            contributionVector: [rsiValue, macdHistogram],
            timestamp: Date.now(),
        });

        // ========== Trend Expert ==========
        const trendBullish = f.trend_bullish;
        const trendBearish = f.trend_bearish;
        const trendStrength = f.trend_strength;

        let trendDirection: 'long' | 'short' | 'neutral' = 'neutral';
        let trendConfidence = 0.4;
        let trendExplanation = 'No clear trend';

        if (trendBullish && trendStrength > 0.4) {
            trendDirection = 'long';
            trendConfidence = 0.5 + trendStrength * 0.4;
            trendExplanation = `Bullish trend (strength: ${(trendStrength * 100).toFixed(0)}%)`;
        } else if (trendBearish && trendStrength > 0.4) {
            trendDirection = 'short';
            trendConfidence = 0.5 + trendStrength * 0.4;
            trendExplanation = `Bearish trend (strength: ${(trendStrength * 100).toFixed(0)}%)`;
        }

        outputs.push({
            expertName: 'Trend',
            predictedReturnComponent: trendBullish ? 0.01 : trendBearish ? -0.01 : 0,
            confidenceComponent: trendConfidence,
            direction: trendDirection,
            strength: trendStrength,
            explanationTokens: [trendExplanation],
            contributionVector: [trendBullish ? 1 : 0, trendBearish ? 1 : 0],
            timestamp: Date.now(),
        });

        // ========== Volume Expert ==========
        const rvol = f.rvol;
        const volHigh = f.volume_high;

        // Volume confirms but doesn't direct
        let volConfidence = 0.4;
        let volExplanation = 'Normal volume';

        if (volHigh) {
            volConfidence = 0.8;
            volExplanation = `High volume (${rvol.toFixed(1)}x avg) - confirms move`;
        } else if (rvol < 0.5) {
            volConfidence = 0.3;
            volExplanation = `Low volume (${rvol.toFixed(1)}x avg) - weak conviction`;
        } else {
            volConfidence = 0.5;
            volExplanation = `Normal volume (${rvol.toFixed(1)}x avg)`;
        }

        // Volume expert takes direction from trend/momentum
        const volDirection = trendDirection !== 'neutral' ? trendDirection : momDirection;

        outputs.push({
            expertName: 'Volume',
            predictedReturnComponent: 0, // Volume doesn't predict direction
            confidenceComponent: volConfidence,
            direction: volDirection,
            strength: Math.min(1, rvol / 2),
            explanationTokens: [volExplanation],
            contributionVector: [rvol],
            timestamp: Date.now(),
        });

        // ========== Levels Expert ==========
        const distToResistance = f.distance_to_resistance;
        const distToSupport = f.distance_to_support;

        let levelsDirection: 'long' | 'short' | 'neutral' = 'neutral';
        let levelsConfidence = 0.4;
        let levelsExplanation = 'No key levels nearby';
        let levelsReturn = 0;

        // Near support = potential bounce
        if (distToSupport < 0.02 && distToSupport < distToResistance) {
            levelsDirection = 'long';
            levelsConfidence = 0.7;
            levelsReturn = 0.015;
            levelsExplanation = `Near support (${(distToSupport * 100).toFixed(1)}% away) - expect bounce`;
        }
        // Near resistance = potential rejection
        else if (distToResistance < 0.02 && distToResistance < distToSupport) {
            levelsDirection = 'short';
            levelsConfidence = 0.7;
            levelsReturn = -0.015;
            levelsExplanation = `Near resistance (${(distToResistance * 100).toFixed(1)}% away) - expect rejection`;
        }
        // In between
        else if (distToSupport > 0.03 && distToResistance > 0.03) {
            levelsConfidence = 0.5;
            levelsExplanation = 'Price in middle of range';
        }

        outputs.push({
            expertName: 'Levels',
            predictedReturnComponent: levelsReturn,
            confidenceComponent: levelsConfidence,
            direction: levelsDirection,
            strength: Math.max(0, 1 - Math.min(distToResistance, distToSupport) * 20),
            explanationTokens: [levelsExplanation],
            contributionVector: [distToResistance, distToSupport],
            timestamp: Date.now(),
        });

        return outputs;
    }

    /**
     * Normalize weights
     */
    private normalizeWeights(weights: number[]): number[] {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum === 0) {
            return weights.map(() => 1 / weights.length);
        }
        return weights.map(w => w / sum);
    }
}
