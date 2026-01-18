/**
 * Options Brain
 * 
 * Specialist brain for options trading.
 * Focuses on IV, Greeks, flow, and risk/reward.
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
 * Options Brain Configuration
 */
const OPTIONS_CONFIG: BrainConfig = {
    desk: 'options',
    name: 'Options Brain',
    description: 'Analyzes options setups using IV, Greeks, flow analysis, and risk management.',
    experts: [],
    defaultHorizonHours: 24, // 1 day default for options
    minConfidenceForIntent: 0.65,
    minStrengthForIntent: 0.55,
};

// Mock optionable symbols
const OPTIONS_WATCH_LIST = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT', 'GOOGL'];

/**
 * Options Brain Implementation
 */
export class OptionsBrain extends BaseBrain {
    readonly config: BrainConfig = OPTIONS_CONFIG;

    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];

        for (const symbol of OPTIONS_WATCH_LIST) {
            const score = 35 + Math.random() * 55;
            const direction = Math.random() > 0.5 ? 'long' : 'short';

            const reasons: string[] = [];

            if (Math.random() > 0.4) {
                reasons.push('IV rank below 30 - options cheap');
            }
            if (Math.random() > 0.5) {
                reasons.push('Unusual options activity detected');
            }
            if (Math.random() > 0.6) {
                reasons.push('Favorable risk/reward on spreads');
            }
            if (reasons.length === 0) {
                reasons.push('Options setup forming');
            }

            candidates.push({
                symbol,
                score,
                direction: direction as 'long' | 'short',
                reasons,
                timestamp: context.timestamp,
            });
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    async buildFeatures(
        candidate: Candidate,
        context: MarketContext
    ): Promise<FeatureVector> {
        const features: Record<string, number> = {
            // IV features
            iv_rank: Math.random() * 100,
            iv_percentile: Math.random() * 100,
            iv_skew: (Math.random() - 0.5) * 20,
            hv_ratio: 0.7 + Math.random() * 0.6,

            // Greeks
            atm_delta: 0.5 + (Math.random() - 0.5) * 0.1,
            gamma_risk: Math.random() * 0.05,
            theta_decay: -0.01 - Math.random() * 0.03,
            vega_exposure: 0.02 + Math.random() * 0.05,

            // Flow
            put_call_ratio: 0.5 + Math.random(),
            unusual_volume: Math.random() > 0.7 ? 2 + Math.random() * 3 : 1,

            // Price features
            price_vs_strikes: Math.random() * 2 - 1,
            days_to_expiry: 7 + Math.random() * 30,

            // Context
            vix: context.vix || 20,
            market_regime: context.marketRegime === 'risk-on' ? 1 :
                context.marketRegime === 'risk-off' ? -1 : 0,
        };

        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features,
            metadata: {
                desk: 'options',
                source: 'options-brain',
            },
        };
    }

    async predict(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<BrainPrediction> {
        this.expertOutputs = await this.runExperts(candidate, features, context);
        this.mixerWeights = this.normalizeWeights(
            this.expertOutputs.map(e => e.confidenceComponent)
        );

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

        const longVotes = this.expertOutputs.filter(e => e.direction === 'long').length;
        const shortVotes = this.expertOutputs.filter(e => e.direction === 'short').length;
        const direction = longVotes > shortVotes ? 'long' :
            shortVotes > longVotes ? 'short' : 'neutral';

        const intervalWidth = 0.03 * (1.5 - totalConfidence);

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
            predictedProbProfit: 0.5 + totalReturn * 5,
            confidence: totalConfidence,

            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + horizonMs),

            direction,
            strength: candidate.score / 100,

            expertContributions: this.getExpertContributions(),
            mixerWeights: this.mixerWeights,
            featureSnapshot: features.features,

            reasons,
            warnings: features.features.days_to_expiry < 7
                ? ['Short dated - theta decay accelerating']
                : undefined,
            invalidation: 'IV expansion or directional move against position',
        };
    }

    private async runExperts(
        candidate: Candidate,
        features: FeatureVector,
        _context: MarketContext
    ): Promise<ExpertOutput[]> {
        const outputs: ExpertOutput[] = [];

        // IV Expert
        const ivRank = features.features.iv_rank;
        outputs.push({
            expertName: 'IV',
            predictedReturnComponent: ivRank < 30 ? 0.02 : ivRank > 70 ? -0.01 : 0,
            confidenceComponent: Math.abs(50 - ivRank) / 50,
            direction: ivRank < 30 ? 'long' : ivRank > 70 ? 'short' : 'neutral',
            strength: Math.abs(50 - ivRank) / 50,
            explanationTokens: [
                ivRank < 30 ? `IV Rank ${ivRank.toFixed(0)} - options cheap` :
                    ivRank > 70 ? `IV Rank ${ivRank.toFixed(0)} - options expensive` :
                        `IV Rank ${ivRank.toFixed(0)} - neutral`
            ],
            contributionVector: [ivRank],
            timestamp: Date.now(),
        });

        // Flow Expert
        const unusualVolume = features.features.unusual_volume;
        outputs.push({
            expertName: 'Flow',
            predictedReturnComponent: unusualVolume > 2 ? 0.015 : 0,
            confidenceComponent: unusualVolume > 2 ? 0.7 : 0.4,
            direction: candidate.direction as 'long' | 'short',
            strength: Math.min(1, unusualVolume / 3),
            explanationTokens: [
                unusualVolume > 2 ? 'Unusual options activity detected' : 'Normal flow'
            ],
            contributionVector: [unusualVolume],
            timestamp: Date.now(),
        });

        // Trend Expert
        outputs.push({
            expertName: 'Trend',
            predictedReturnComponent: 0.01 * (candidate.direction === 'long' ? 1 : -1),
            confidenceComponent: 0.6,
            direction: candidate.direction as 'long' | 'short',
            strength: 0.5,
            explanationTokens: ['Price trend aligned with options setup'],
            contributionVector: [1],
            timestamp: Date.now(),
        });

        // EventRisk Expert
        outputs.push({
            expertName: 'EventRisk',
            predictedReturnComponent: 0,
            confidenceComponent: 0.6,
            direction: 'neutral',
            strength: 0.3,
            explanationTokens: ['No major events scheduled'],
            contributionVector: [0],
            timestamp: Date.now(),
        });

        return outputs;
    }

    private normalizeWeights(weights: number[]): number[] {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum === 0) return weights.map(() => 1 / weights.length);
        return weights.map(w => w / sum);
    }
}
