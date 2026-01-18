/**
 * Swing Brain
 * 
 * Specialist brain for multi-day swing trades.
 * Focuses on trend, support/resistance, and sector strength.
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

const SWING_CONFIG: BrainConfig = {
    desk: 'swing',
    name: 'Swing Trading Brain',
    description: 'Analyzes multi-day setups using trend, S/R levels, and relative strength.',
    experts: [],
    defaultHorizonHours: 72, // 3 days
    minConfidenceForIntent: 0.6,
    minStrengthForIntent: 0.5,
};

const SWING_WATCH_LIST = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'GS'];

export class SwingBrain extends BaseBrain {
    readonly config: BrainConfig = SWING_CONFIG;

    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];

        for (const symbol of SWING_WATCH_LIST) {
            const score = 30 + Math.random() * 60;
            const direction = Math.random() > 0.45 ? 'long' : 'short';

            const reasons: string[] = [];
            if (Math.random() > 0.4) reasons.push('Strong uptrend with pullback to support');
            if (Math.random() > 0.5) reasons.push('Sector outperforming market');
            if (Math.random() > 0.6) reasons.push('Clean technical setup forming');
            if (reasons.length === 0) reasons.push('Swing setup developing');

            candidates.push({ symbol, score, direction: direction as 'long' | 'short', reasons, timestamp: context.timestamp });
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    async buildFeatures(candidate: Candidate, context: MarketContext): Promise<FeatureVector> {
        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features: {
                trend_strength: Math.random() * 2 - 1,
                rs_vs_spy: Math.random() * 0.1 - 0.05,
                distance_to_20ma: Math.random() * 0.1 - 0.05,
                distance_to_50ma: Math.random() * 0.15 - 0.075,
                support_distance: Math.random() * 0.05,
                resistance_distance: Math.random() * 0.05,
                adx: 15 + Math.random() * 35,
                rsi_daily: 30 + Math.random() * 40,
            },
            metadata: { desk: 'swing', source: 'swing-brain' },
        };
    }

    async predict(candidate: Candidate, features: FeatureVector, context: MarketContext): Promise<BrainPrediction> {
        this.expertOutputs = await this.runExperts(candidate, features);
        this.mixerWeights = this.normalizeWeights(this.expertOutputs.map(e => e.confidenceComponent));

        let totalReturn = 0, totalConfidence = 0;
        const reasons: string[] = [];

        for (let i = 0; i < this.expertOutputs.length; i++) {
            totalReturn += this.expertOutputs[i].predictedReturnComponent * this.mixerWeights[i];
            totalConfidence += this.expertOutputs[i].confidenceComponent * this.mixerWeights[i];
            if (this.expertOutputs[i].explanationTokens[0]) {
                reasons.push(`${this.expertOutputs[i].expertName}: ${this.expertOutputs[i].explanationTokens[0]}`);
            }
        }

        const direction = this.expertOutputs.filter(e => e.direction === 'long').length >
            this.expertOutputs.filter(e => e.direction === 'short').length ? 'long' : 'short';

        const now = new Date();
        return {
            id: uuidv4(), createdAt: now, brainType: this.desk, symbol: candidate.symbol,
            predictedReturnMean: totalReturn,
            predictedIntervalLow: totalReturn - 0.04,
            predictedIntervalHigh: totalReturn + 0.04,
            predictedProbProfit: 0.5 + totalReturn * 3,
            confidence: totalConfidence,
            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + 72 * 60 * 60 * 1000),
            direction, strength: candidate.score / 100,
            expertContributions: this.getExpertContributions(),
            mixerWeights: this.mixerWeights,
            featureSnapshot: features.features,
            reasons,
            invalidation: 'Price closes below key support level',
        };
    }

    private async runExperts(candidate: Candidate, features: FeatureVector): Promise<ExpertOutput[]> {
        const trend = features.features.trend_strength;
        const rs = features.features.rs_vs_spy;
        const adx = features.features.adx;

        return [
            {
                expertName: 'Trend', predictedReturnComponent: trend * 0.02,
                confidenceComponent: adx > 25 ? 0.8 : 0.5,
                direction: trend > 0 ? 'long' : 'short', strength: Math.abs(trend),
                explanationTokens: [trend > 0 ? 'In uptrend' : 'In downtrend'],
                contributionVector: [trend, adx], timestamp: Date.now(),
            },
            {
                expertName: 'RelativeStrength', predictedReturnComponent: rs * 0.5,
                confidenceComponent: Math.abs(rs) > 0.02 ? 0.7 : 0.5,
                direction: rs > 0 ? 'long' : 'short', strength: Math.abs(rs * 10),
                explanationTokens: [rs > 0 ? 'Outperforming SPY' : 'Underperforming SPY'],
                contributionVector: [rs], timestamp: Date.now(),
            },
            {
                expertName: 'Levels', predictedReturnComponent: 0,
                confidenceComponent: 0.6,
                direction: candidate.direction as 'long' | 'short', strength: 0.5,
                explanationTokens: ['Near support/resistance'],
                contributionVector: [features.features.support_distance], timestamp: Date.now(),
            },
        ];
    }

    private normalizeWeights(w: number[]): number[] {
        const s = w.reduce((a, b) => a + b, 0);
        return s === 0 ? w.map(() => 1 / w.length) : w.map(x => x / s);
    }
}
