/**
 * Day Trading Brain
 * 
 * Specialist brain for intraday trading.
 * Focuses on momentum, VWAP, levels, and liquidity.
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

/**
 * Day Trading Brain Configuration
 */
const DAY_TRADING_CONFIG: BrainConfig = {
    desk: 'day-trading',
    name: 'Day Trading Brain',
    description: 'Analyzes intraday setups using momentum, VWAP, levels, and liquidity.',
    experts: [], // Will be populated
    defaultHorizonHours: 1, // 1 hour horizon for day trades
    minConfidenceForIntent: 0.6,
    minStrengthForIntent: 0.5,
};

// Mock symbols for scanning
const WATCH_LIST = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META'];

/**
 * Day Trading Brain Implementation
 */
export class DayTradingBrain extends BaseBrain {
    readonly config: BrainConfig = DAY_TRADING_CONFIG;

    /**
     * Scan for intraday candidates
     */
    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];

        for (const symbol of WATCH_LIST) {
            // Mock scoring based on "analysis"
            const score = 40 + Math.random() * 50; // 40-90 range
            const direction = Math.random() > 0.5 ? 'long' : 'short';

            const reasons: string[] = [];

            // Mock reasons based on random factors
            if (Math.random() > 0.5) {
                reasons.push('Price above VWAP with momentum');
            }
            if (Math.random() > 0.6) {
                reasons.push('Breaking key resistance level');
            }
            if (Math.random() > 0.7) {
                reasons.push('Relative volume above average');
            }
            if (reasons.length === 0) {
                reasons.push('Technical setup forming');
            }

            candidates.push({
                symbol,
                score,
                direction: direction as 'long' | 'short',
                reasons,
                timestamp: context.timestamp,
            });
        }

        // Sort by score
        return candidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Build feature vector for a candidate
     */
    async buildFeatures(
        candidate: Candidate,
        context: MarketContext
    ): Promise<FeatureVector> {
        // Mock feature extraction
        const features: Record<string, number> = {
            // Price features
            price_vs_vwap: Math.random() * 2 - 1,
            price_vs_open: Math.random() * 0.1 - 0.05,
            price_vs_high: -Math.random() * 0.05,
            price_vs_low: Math.random() * 0.05,

            // Momentum features
            rsi_14: 30 + Math.random() * 40,
            macd_histogram: Math.random() * 2 - 1,
            momentum_5m: Math.random() * 0.02 - 0.01,

            // Volume features
            rvol: 0.5 + Math.random() * 2.5,
            volume_trend: Math.random() * 2 - 1,

            // Level features
            distance_to_resistance: Math.random() * 0.05,
            distance_to_support: Math.random() * 0.05,

            // Context features
            market_regime: context.marketRegime === 'risk-on' ? 1 :
                context.marketRegime === 'risk-off' ? -1 : 0,
            vix: context.vix || 20,
        };

        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features,
            metadata: {
                desk: 'day-trading',
                source: 'day-trading-brain',
            },
        };
    }

    /**
     * Generate prediction from features
     */
    async predict(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<BrainPrediction> {
        // Run experts (mock for now)
        this.expertOutputs = await this.runExperts(candidate, features, context);

        // Apply mixer (mock Sinkhorn-like normalization)
        this.mixerWeights = this.normalizeWeights(
            this.expertOutputs.map(e => e.confidenceComponent)
        );

        // Combine expert outputs
        let totalReturn = 0;
        let totalConfidence = 0;
        const reasons: string[] = [];

        for (let i = 0; i < this.expertOutputs.length; i++) {
            const output = this.expertOutputs[i];
            const weight = this.mixerWeights[i];

            totalReturn += output.predictedReturnComponent * weight;
            totalConfidence += output.confidenceComponent * weight;

            if (output.explanationTokens.length > 0) {
                reasons.push(`${output.expertName}: ${output.explanationTokens[0]}`);
            }
        }

        // Determine direction from weighted outputs
        const longVotes = this.expertOutputs.filter(e => e.direction === 'long').length;
        const shortVotes = this.expertOutputs.filter(e => e.direction === 'short').length;
        const direction = longVotes > shortVotes ? 'long' :
            shortVotes > longVotes ? 'short' : 'neutral';

        // Calculate prediction interval (mock)
        const intervalWidth = 0.02 * (1.5 - totalConfidence); // Wider when less confident

        const now = new Date();
        const horizonMs = this.config.defaultHorizonHours * 60 * 60 * 1000;

        return {
            id: uuidv4(),
            createdAt: now,
            brainType: this.desk,
            symbol: candidate.symbol,

            predictedReturnMean: totalReturn,
            predictedIntervalLow: totalReturn - intervalWidth,
            predictedIntervalHigh: totalReturn + intervalWidth,
            predictedProbProfit: direction === 'long' ?
                0.5 + totalReturn * 10 : // Higher return = higher prob
                direction === 'short' ?
                    0.5 - totalReturn * 10 :
                    0.5,
            confidence: totalConfidence,

            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + horizonMs),

            direction,
            strength: candidate.score / 100,

            expertContributions: this.getExpertContributions(),
            mixerWeights: this.mixerWeights,
            featureSnapshot: features.features,

            reasons,
            warnings: totalConfidence < 0.5 ? ['Low confidence setup'] : undefined,
            invalidation: direction === 'long'
                ? 'Price drops below VWAP with volume'
                : direction === 'short'
                    ? 'Price breaks above resistance with volume'
                    : undefined,
        };
    }

    /**
     * Run all experts (mock implementation)
     */
    private async runExperts(
        candidate: Candidate,
        features: FeatureVector,
        _context: MarketContext
    ): Promise<ExpertOutput[]> {
        const outputs: ExpertOutput[] = [];

        // VWAP Expert
        const vwapSignal = features.features.price_vs_vwap;
        outputs.push({
            expertName: 'VWAP',
            predictedReturnComponent: vwapSignal * 0.01,
            confidenceComponent: Math.abs(vwapSignal) > 0.5 ? 0.8 : 0.5,
            direction: vwapSignal > 0 ? 'long' : vwapSignal < 0 ? 'short' : 'neutral',
            strength: Math.abs(vwapSignal),
            explanationTokens: [
                vwapSignal > 0 ? 'Price trading above VWAP' : 'Price trading below VWAP'
            ],
            contributionVector: [vwapSignal],
            timestamp: Date.now(),
        });

        // Momentum Expert
        const rsi = features.features.rsi_14;
        const momentumDirection = rsi > 60 ? 'long' : rsi < 40 ? 'short' : 'neutral';
        outputs.push({
            expertName: 'Momentum',
            predictedReturnComponent: (rsi - 50) / 1000,
            confidenceComponent: rsi > 70 || rsi < 30 ? 0.7 : 0.5,
            direction: momentumDirection,
            strength: Math.abs(rsi - 50) / 50,
            explanationTokens: [
                rsi > 60 ? 'RSI showing bullish momentum' :
                    rsi < 40 ? 'RSI showing bearish momentum' :
                        'RSI neutral'
            ],
            contributionVector: [rsi],
            timestamp: Date.now(),
        });

        // Liquidity Expert
        const rvol = features.features.rvol;
        outputs.push({
            expertName: 'Liquidity',
            predictedReturnComponent: 0,
            confidenceComponent: rvol > 1.5 ? 0.8 : rvol > 1 ? 0.6 : 0.4,
            direction: candidate.direction as 'long' | 'short' | 'neutral',
            strength: Math.min(1, rvol / 2),
            explanationTokens: [
                rvol > 1.5 ? 'High relative volume confirms move' :
                    rvol > 1 ? 'Normal volume' :
                        'Below average volume - watch closely'
            ],
            contributionVector: [rvol],
            timestamp: Date.now(),
        });

        // Level Expert
        const distToResistance = features.features.distance_to_resistance;
        const distToSupport = features.features.distance_to_support;
        const nearLevel = distToResistance < 0.01 || distToSupport < 0.01;
        outputs.push({
            expertName: 'Levels',
            predictedReturnComponent: 0,
            confidenceComponent: nearLevel ? 0.7 : 0.5,
            direction: distToResistance < distToSupport ? 'long' : 'short',
            strength: nearLevel ? 0.7 : 0.3,
            explanationTokens: [
                nearLevel ? 'Price near key level' : 'No immediate levels'
            ],
            contributionVector: [distToResistance, distToSupport],
            timestamp: Date.now(),
        });

        return outputs;
    }

    /**
     * Normalize weights (simple Sinkhorn-like)
     */
    private normalizeWeights(weights: number[]): number[] {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum === 0) {
            return weights.map(() => 1 / weights.length);
        }
        return weights.map(w => w / sum);
    }
}
