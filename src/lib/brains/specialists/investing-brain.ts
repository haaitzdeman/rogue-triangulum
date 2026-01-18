/**
 * Investing Brain
 * 
 * Specialist brain for long-term investing.
 * Focuses on fundamentals, quality, value, and growth.
 */

import { BaseBrain } from '../interface';
import type { BrainConfig, ExpertOutput } from '../interface';
import type {
    MarketContext,
    Candidate,
    FeatureVector,
    BrainPrediction,
    TradeIntent,
} from '../../core/types';
import { v4 as uuidv4 } from 'uuid';

const INVESTING_CONFIG: BrainConfig = {
    desk: 'investing',
    name: 'Investing Brain',
    description: 'Analyzes long-term investments using fundamentals, quality, value, and growth metrics.',
    experts: [],
    defaultHorizonHours: 720, // 30 days
    minConfidenceForIntent: 0.7,
    minStrengthForIntent: 0.6,
};

const INVESTING_WATCH_LIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'BRK.B', 'JPM', 'JNJ', 'V', 'UNH', 'PG'];

export class InvestingBrain extends BaseBrain {
    readonly config: BrainConfig = INVESTING_CONFIG;

    async scanCandidates(context: MarketContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];

        for (const symbol of INVESTING_WATCH_LIST) {
            const score = 40 + Math.random() * 50;

            const reasons: string[] = [];
            if (Math.random() > 0.3) reasons.push('Strong balance sheet and cash flow');
            if (Math.random() > 0.4) reasons.push('Reasonable valuation vs growth');
            if (Math.random() > 0.5) reasons.push('Competitive moat in sector');
            if (reasons.length === 0) reasons.push('Quality company for long-term hold');

            candidates.push({
                symbol, score, direction: 'long', // Investing is typically long
                reasons, timestamp: context.timestamp,
            });
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    async buildFeatures(candidate: Candidate, context: MarketContext): Promise<FeatureVector> {
        return {
            symbol: candidate.symbol,
            timestamp: context.timestamp,
            features: {
                pe_ratio: 15 + Math.random() * 25,
                peg_ratio: 0.8 + Math.random() * 1.5,
                debt_to_equity: Math.random() * 1.5,
                roe: 0.1 + Math.random() * 0.25,
                revenue_growth: 0.05 + Math.random() * 0.2,
                fcf_yield: 0.02 + Math.random() * 0.06,
                dividend_yield: Math.random() * 0.04,
                quality_score: 50 + Math.random() * 50,
            },
            metadata: { desk: 'investing', source: 'investing-brain' },
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

        const now = new Date();
        return {
            id: uuidv4(), createdAt: now, brainType: this.desk, symbol: candidate.symbol,
            predictedReturnMean: totalReturn,
            predictedIntervalLow: totalReturn - 0.10,
            predictedIntervalHigh: totalReturn + 0.15,
            predictedProbProfit: 0.5 + totalReturn * 2,
            confidence: totalConfidence,
            evaluationWindowHours: this.config.defaultHorizonHours,
            evaluationWindowEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            direction: 'long', strength: candidate.score / 100,
            expertContributions: this.getExpertContributions(),
            mixerWeights: this.mixerWeights,
            featureSnapshot: features.features,
            reasons,
            invalidation: 'Fundamental deterioration or valuation becomes extreme',
        };
    }

    // Investing brain rarely proposes trades - focus is on analysis
    proposeTradeIntent(_prediction: BrainPrediction, _context: MarketContext): TradeIntent | null {
        return null; // Investing focuses on analysis, not frequent trading
    }

    private async runExperts(candidate: Candidate, features: FeatureVector): Promise<ExpertOutput[]> {
        const quality = features.features.quality_score;
        const pe = features.features.pe_ratio;
        const growth = features.features.revenue_growth;
        const fcf = features.features.fcf_yield;

        return [
            {
                expertName: 'Quality', predictedReturnComponent: (quality - 50) / 500,
                confidenceComponent: quality > 70 ? 0.8 : 0.5,
                direction: 'long', strength: quality / 100,
                explanationTokens: [quality > 70 ? 'High quality metrics' : 'Average quality'],
                contributionVector: [quality], timestamp: Date.now(),
            },
            {
                expertName: 'Value', predictedReturnComponent: pe < 20 ? 0.02 : pe > 35 ? -0.01 : 0,
                confidenceComponent: 0.6,
                direction: pe < 25 ? 'long' : 'neutral', strength: pe < 20 ? 0.7 : 0.3,
                explanationTokens: [pe < 20 ? 'Reasonably valued' : pe > 35 ? 'Premium valuation' : 'Fair value'],
                contributionVector: [pe], timestamp: Date.now(),
            },
            {
                expertName: 'Growth', predictedReturnComponent: growth * 0.3,
                confidenceComponent: growth > 0.15 ? 0.7 : 0.5,
                direction: growth > 0.1 ? 'long' : 'neutral', strength: Math.min(1, growth * 5),
                explanationTokens: [`${(growth * 100).toFixed(0)}% revenue growth`],
                contributionVector: [growth], timestamp: Date.now(),
            },
            {
                expertName: 'FCF', predictedReturnComponent: fcf * 0.5,
                confidenceComponent: fcf > 0.04 ? 0.7 : 0.5,
                direction: fcf > 0.03 ? 'long' : 'neutral', strength: fcf * 15,
                explanationTokens: [`${(fcf * 100).toFixed(1)}% FCF yield`],
                contributionVector: [fcf], timestamp: Date.now(),
            },
        ];
    }

    private normalizeWeights(w: number[]): number[] {
        const s = w.reduce((a, b) => a + b, 0);
        return s === 0 ? w.map(() => 1 / w.length) : w.map(x => x / s);
    }
}
