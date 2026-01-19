/**
 * Specialist Brain Interface
 * 
 * All brains (DayTrading, Options, Swing, Investing) implement this interface.
 * This ensures consistent behavior and auditable predictions.
 */

import type {
    DeskType,
    MarketContext,
    Candidate,
    FeatureVector,
    BrainPrediction,
    TradeIntent,
    Explanation,
    ExpertContribution,
} from '../core/types';

/**
 * Expert interface - submodule within a brain
 */
export interface Expert {
    readonly name: string;
    readonly defaultWeight: number;

    /**
     * Analyze a candidate and return expert-specific output
     */
    analyze(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<ExpertOutput>;

    /**
     * Get explanation for this expert's contribution
     */
    explain(output: ExpertOutput): string[];
}

/**
 * Output from a single expert
 */
export interface ExpertOutput {
    expertName: string;

    // Prediction components
    predictedReturnComponent: number;   // Contribution to return prediction
    confidenceComponent: number;        // Expert's confidence (0-1)

    // Signal
    direction: 'long' | 'short' | 'neutral';
    strength: number;                   // 0-1

    // Explanation
    explanationTokens: string[];

    // Audit
    contributionVector: number[];       // Raw values for audit

    // Metadata
    timestamp: number;
}

/**
 * Brain configuration
 */
export interface BrainConfig {
    desk: DeskType;
    name: string;
    description: string;

    // Expert setup
    experts: Expert[];

    // Prediction settings
    defaultHorizonHours: number;
    minConfidenceForIntent: number;
    minStrengthForIntent: number;
}

/**
 * Specialist Brain Interface
 * 
 * All trading style brains implement this interface
 */
export interface SpecialistBrain {
    readonly config: BrainConfig;
    readonly desk: DeskType;

    /**
     * Scan universe for candidates matching this brain's style
     */
    scanCandidates(context: MarketContext): Promise<Candidate[]>;

    /**
     * Build feature vector for a candidate
     * Captures all inputs needed for prediction
     */
    buildFeatures(
        candidate: Candidate,
        context: MarketContext
    ): Promise<FeatureVector>;

    /**
     * Generate prediction from features
     * Uses all experts and mixer to produce final prediction
     */
    predict(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<BrainPrediction>;

    /**
     * Generate human-readable explanation
     */
    explain(prediction: BrainPrediction): Explanation;

    /**
     * Propose trade intent (optional - brain may decline)
     * Returns null if prediction doesn't meet criteria
     */
    proposeTradeIntent(
        prediction: BrainPrediction,
        context: MarketContext
    ): TradeIntent | null;

    /**
     * Get expert contributions for audit
     */
    getExpertContributions(): ExpertContribution[];
}

/**
 * Abstract base class for specialist brains
 */
export abstract class BaseBrain implements SpecialistBrain {
    abstract readonly config: BrainConfig;

    get desk(): DeskType {
        return this.config.desk;
    }

    protected expertOutputs: ExpertOutput[] = [];
    protected mixerWeights: number[] = [];

    abstract scanCandidates(context: MarketContext): Promise<Candidate[]>;

    abstract buildFeatures(
        candidate: Candidate,
        context: MarketContext
    ): Promise<FeatureVector>;

    abstract predict(
        candidate: Candidate,
        features: FeatureVector,
        context: MarketContext
    ): Promise<BrainPrediction>;

    /**
     * Default explanation generator
     * V1: Uses explainable ATR/stop/target outputs instead of fake predictions
     */
    explain(prediction: BrainPrediction): Explanation {
        const direction = prediction.direction === 'long' ? 'bullish' :
            prediction.direction === 'short' ? 'bearish' : 'neutral';

        const riskLevel = prediction.confidence >= 0.7 ? 'low' :
            prediction.confidence >= 0.4 ? 'medium' : 'high';

        // V1: Use ATR-based outputs instead of fake probability predictions
        const targetInfo = prediction.targetPrice
            ? `Target: $${prediction.targetPrice.toFixed(2)}`
            : '';
        const stopInfo = prediction.riskStop
            ? `Stop: $${prediction.riskStop.toFixed(2)}`
            : '';
        const atrInfo = prediction.atrPercent
            ? `ATR: ${prediction.atrPercent.toFixed(1)}%`
            : '';

        const summary = `${prediction.symbol} shows ${direction} setup. ` +
            `${targetInfo} ${stopInfo} ${atrInfo}`.trim();

        const beginnerSummary = prediction.direction === 'long'
            ? `${prediction.symbol} looks like it could go up. Confidence: ${Math.round(prediction.confidence * 100)}%.`
            : prediction.direction === 'short'
                ? `${prediction.symbol} looks like it could go down. Confidence: ${Math.round(prediction.confidence * 100)}%.`
                : `${prediction.symbol} doesn't have a clear direction right now.`;

        return {
            summary,
            beginnerSummary,
            whyThisPick: prediction.reasons.join('. '),
            whatWouldInvalidate: prediction.invalidation || 'Price moves against us significantly',
            details: prediction.reasons,
            warnings: prediction.warnings || [],
            riskLevel,
        };
    }

    /**
     * Default trade intent proposal
     */
    proposeTradeIntent(
        prediction: BrainPrediction,
        _context: MarketContext
    ): TradeIntent | null {
        // Check minimum thresholds
        if (prediction.confidence < this.config.minConfidenceForIntent) {
            return null;
        }

        if (prediction.strength < this.config.minStrengthForIntent) {
            return null;
        }

        if (prediction.direction === 'neutral') {
            return null;
        }

        // Create intent
        return {
            id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date(),
            brainType: this.desk,
            forecastId: prediction.id,
            symbol: prediction.symbol,
            direction: prediction.direction,
            quantity: 0, // To be sized by TradeGate based on risk
            orderType: 'market',
            maxRiskDollars: 0, // To be set by TradeGate
            timeInForce: 'day',
        };
    }

    /**
     * Get expert contributions for audit
     */
    getExpertContributions(): ExpertContribution[] {
        return this.expertOutputs.map((output, i) => ({
            expertName: output.expertName,
            predictedReturnComponent: output.predictedReturnComponent,
            confidenceComponent: output.confidenceComponent,
            weight: this.mixerWeights[i] || 0,
            explanationTokens: output.explanationTokens,
        }));
    }
}
