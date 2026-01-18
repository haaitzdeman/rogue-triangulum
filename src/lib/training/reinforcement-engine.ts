/**
 * Reinforcement Learning Engine
 * 
 * Gamifies the training process:
 * - Agents make predictions on historical data
 * - Predictions are compared to actual outcomes
 * - Successes reward the contributing experts
 * - Failures penalize and analyze why
 * - Expert weights evolve over time
 */

import { v4 as uuidv4 } from 'uuid';
import type { DeskType, MarketContext, BrainPrediction, ExpertContribution } from '../core/types';
import { getOrchestrator } from '../core/orchestrator';
import { getForecastTracker } from '../forecast';
import { PolygonTrainingProvider } from './polygon-provider';
import type { OHLCVBar, Timeframe } from './provider-adapter';
import { DayTradingBrain, OptionsBrain, SwingBrain, InvestingBrain } from '../brains';

/**
 * Training episode result
 */
export interface EpisodeResult {
    id: string;
    timestamp: number;
    symbol: string;
    desk: DeskType;

    // Prediction
    predictedDirection: 'long' | 'short' | 'neutral';
    predictedReturn: number;
    confidence: number;

    // Actual outcome
    actualReturn: number;
    actualDirection: 'long' | 'short' | 'neutral';

    // Result
    success: boolean;
    reward: number;  // Positive for success, negative for failure

    // Expert analysis
    expertContributions: ExpertContribution[];
    expertRewards: Record<string, number>;

    // Learning
    lessonLearned: string;
}

/**
 * Expert performance tracker
 */
export interface ExpertStats {
    name: string;
    totalEpisodes: number;
    successCount: number;
    failureCount: number;
    accuracy: number;
    totalReward: number;
    avgReward: number;
    currentWeight: number;
    weightHistory: { timestamp: number; weight: number }[];
}

/**
 * Training session summary
 */
export interface TrainingSession {
    id: string;
    startTime: Date;
    endTime?: Date;

    // Progress
    episodesCompleted: number;
    totalEpisodes: number;

    // Performance
    overallAccuracy: number;
    totalReward: number;

    // Expert evolution
    expertStats: Record<string, ExpertStats>;

    // Status
    status: 'running' | 'completed' | 'failed';
    currentSymbol?: string;
    currentDate?: string;
}

/**
 * Learning configuration
 */
export interface LearningConfig {
    // Data range
    startDate: Date;
    endDate: Date;

    // Training parameters
    symbols: string[];
    desks: DeskType[];
    timeframe: Timeframe;

    // Evaluation
    evaluationWindowBars: number;

    // Learning rates
    successReward: number;      // Reward for correct prediction
    failurePenalty: number;     // Penalty for wrong prediction
    learningRate: number;       // How fast weights adjust

    // Sampling
    skipBars: number;           // Skip N bars between predictions (avoid over-sampling)
}

const DEFAULT_LEARNING_CONFIG: LearningConfig = {
    startDate: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000), // 2 years ago
    endDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),    // 3 months ago (holdout)
    symbols: ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META'],
    desks: ['day-trading'],
    timeframe: '1h',
    evaluationWindowBars: 4,
    successReward: 1.0,
    failurePenalty: -0.5,
    learningRate: 0.1,
    skipBars: 6,  // 1 prediction every 6 hours
};

/**
 * Reinforcement Learning Engine
 */
export class ReinforcementEngine {
    private config: LearningConfig;
    private provider: PolygonTrainingProvider;
    private session: TrainingSession | null = null;
    private episodes: EpisodeResult[] = [];
    private expertStats: Map<string, ExpertStats> = new Map();
    private brainsRegistered = false;

    constructor(config?: Partial<LearningConfig>) {
        this.config = { ...DEFAULT_LEARNING_CONFIG, ...config };
        this.provider = new PolygonTrainingProvider();
    }

    /**
     * Initialize expert stats
     */
    private initExpertStats(): void {
        const experts = ['VWAP', 'Momentum', 'Liquidity', 'Levels', 'IV', 'Flow', 'Trend', 'EventRisk', 'RelativeStrength', 'Quality', 'Value', 'Growth', 'FCF'];

        for (const name of experts) {
            if (!this.expertStats.has(name)) {
                this.expertStats.set(name, {
                    name,
                    totalEpisodes: 0,
                    successCount: 0,
                    failureCount: 0,
                    accuracy: 0,
                    totalReward: 0,
                    avgReward: 0,
                    currentWeight: 0.25, // Start equal
                    weightHistory: [{ timestamp: Date.now(), weight: 0.25 }],
                });
            }
        }
    }

    /**
     * Ensure brains are registered
     */
    private ensureBrains(): void {
        if (this.brainsRegistered) return;

        const orchestrator = getOrchestrator();
        orchestrator.registerBrain(new DayTradingBrain());
        orchestrator.registerBrain(new OptionsBrain());
        orchestrator.registerBrain(new SwingBrain());
        orchestrator.registerBrain(new InvestingBrain());

        this.brainsRegistered = true;
    }

    /**
     * Run a single training episode
     */
    private async runEpisode(
        symbol: string,
        bars: OHLCVBar[],
        barIndex: number,
        desk: DeskType
    ): Promise<EpisodeResult | null> {
        // Anti-lookahead: only use data up to current point
        const availableBars = bars.slice(0, barIndex + 1);
        const currentBar = availableBars[availableBars.length - 1];
        const futureBar = bars[barIndex + this.config.evaluationWindowBars];

        if (!futureBar) return null;

        const orchestrator = getOrchestrator();
        orchestrator.setActiveDesk(desk);

        // Build context from available data
        const context: MarketContext = {
            timestamp: currentBar.timestamp,
            marketOpen: true,
            preMarket: false,
            afterHours: false,
            marketRegime: this.inferRegime(availableBars),
        };

        try {
            // Get prediction
            const prediction = await orchestrator.requestPrediction(symbol, context);
            if (!prediction) return null;

            // Calculate actual outcome
            const actualReturn = (futureBar.close - currentBar.close) / currentBar.close;
            const actualDirection: 'long' | 'short' | 'neutral' =
                actualReturn > 0.005 ? 'long' :
                    actualReturn < -0.005 ? 'short' : 'neutral';

            // Determine success
            const success = prediction.direction === actualDirection ||
                (prediction.direction === 'long' && actualReturn > 0) ||
                (prediction.direction === 'short' && actualReturn < 0);

            // Calculate reward
            const baseReward = success ? this.config.successReward : this.config.failurePenalty;
            const magnitudeBonus = success ? Math.abs(actualReturn) * 10 : 0;
            const reward = baseReward + magnitudeBonus;

            // Calculate expert rewards and update weights
            const expertRewards = this.calculateExpertRewards(
                prediction.expertContributions,
                prediction.direction,
                actualDirection,
                reward
            );

            // Generate lesson learned
            const lessonLearned = this.generateLesson(
                prediction,
                actualReturn,
                success,
                expertRewards
            );

            const episode: EpisodeResult = {
                id: uuidv4(),
                timestamp: currentBar.timestamp,
                symbol,
                desk,
                predictedDirection: prediction.direction,
                predictedReturn: prediction.predictedReturnMean,
                confidence: prediction.confidence,
                actualReturn,
                actualDirection,
                success,
                reward,
                expertContributions: prediction.expertContributions,
                expertRewards,
                lessonLearned,
            };

            // Update expert stats
            this.updateExpertStats(expertRewards, success);

            return episode;
        } catch (error) {
            console.warn(`[RL] Episode error for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Calculate rewards for each expert based on their contribution
     */
    private calculateExpertRewards(
        contributions: ExpertContribution[],
        predictedDir: 'long' | 'short' | 'neutral',
        actualDir: 'long' | 'short' | 'neutral',
        totalReward: number
    ): Record<string, number> {
        const rewards: Record<string, number> = {};

        for (const contrib of contributions) {
            // Did this expert agree with the final prediction?
            const agreedWithPrediction = contrib.predictedReturnComponent > 0 && predictedDir === 'long' ||
                contrib.predictedReturnComponent < 0 && predictedDir === 'short';

            // Did this expert's individual prediction match actual?
            const expertCorrect = contrib.predictedReturnComponent > 0 && actualDir === 'long' ||
                contrib.predictedReturnComponent < 0 && actualDir === 'short';

            // Reward based on correctness and weight
            if (expertCorrect) {
                // Expert was right - reward proportional to weight
                rewards[contrib.expertName] = Math.abs(totalReward) * contrib.weight;
            } else if (agreedWithPrediction && totalReward < 0) {
                // Expert contributed to a wrong prediction
                rewards[contrib.expertName] = totalReward * contrib.weight;
            } else {
                // Expert disagreed with wrong prediction (should have been listened to more)
                rewards[contrib.expertName] = Math.abs(totalReward) * contrib.weight * 0.5;
            }
        }

        return rewards;
    }

    /**
     * Update expert statistics and weights
     */
    private updateExpertStats(expertRewards: Record<string, number>, _success: boolean): void {
        for (const [name, reward] of Object.entries(expertRewards)) {
            let stats = this.expertStats.get(name);

            if (!stats) {
                stats = {
                    name,
                    totalEpisodes: 0,
                    successCount: 0,
                    failureCount: 0,
                    accuracy: 0,
                    totalReward: 0,
                    avgReward: 0,
                    currentWeight: 0.25,
                    weightHistory: [],
                };
                this.expertStats.set(name, stats);
            }

            stats.totalEpisodes++;
            stats.totalReward += reward;
            stats.avgReward = stats.totalReward / stats.totalEpisodes;

            if (reward > 0) {
                stats.successCount++;
            } else {
                stats.failureCount++;
            }

            stats.accuracy = stats.successCount / stats.totalEpisodes;

            // Adjust weight based on performance (bounded 0.05 to 0.5)
            const adjustment = reward * this.config.learningRate;
            stats.currentWeight = Math.max(0.05, Math.min(0.5, stats.currentWeight + adjustment));

            // Log weight change periodically
            if (stats.totalEpisodes % 100 === 0) {
                stats.weightHistory.push({
                    timestamp: Date.now(),
                    weight: stats.currentWeight,
                });
            }
        }
    }

    /**
     * Generate a lesson from the episode
     */
    private generateLesson(
        prediction: BrainPrediction,
        actualReturn: number,
        success: boolean,
        expertRewards: Record<string, number>
    ): string {
        if (success) {
            const bestExpert = Object.entries(expertRewards)
                .sort((a, b) => b[1] - a[1])[0];
            return `✅ Correct ${prediction.direction} call. Best contributor: ${bestExpert?.[0] || 'Unknown'}. ` +
                `Actual return: ${(actualReturn * 100).toFixed(2)}%`;
        } else {
            const worstExpert = Object.entries(expertRewards)
                .sort((a, b) => a[1] - b[1])[0];
            const reason = prediction.direction === 'long' && actualReturn < 0
                ? 'Market moved against long bias'
                : prediction.direction === 'short' && actualReturn > 0
                    ? 'Short thesis invalidated by upward move'
                    : 'Neutral call missed directional move';
            return `❌ Wrong ${prediction.direction} call. ${reason}. ` +
                `Weakest signal: ${worstExpert?.[0] || 'Unknown'}. ` +
                `Actual return: ${(actualReturn * 100).toFixed(2)}%`;
        }
    }

    /**
     * Infer market regime from price data
     */
    private inferRegime(bars: OHLCVBar[]): MarketContext['marketRegime'] {
        if (bars.length < 20) return 'neutral';

        const recent = bars.slice(-20);
        const avgClose = recent.reduce((sum, b) => sum + b.close, 0) / recent.length;
        const lastClose = bars[bars.length - 1].close;
        const deviation = (lastClose - avgClose) / avgClose;

        if (deviation > 0.03) return 'risk-on';
        if (deviation < -0.03) return 'risk-off';
        return 'neutral';
    }

    /**
     * Run full training session
     */
    async train(onProgress?: (session: TrainingSession) => void): Promise<TrainingSession> {
        this.ensureBrains();
        this.initExpertStats();

        const sessionId = uuidv4();
        this.session = {
            id: sessionId,
            startTime: new Date(),
            episodesCompleted: 0,
            totalEpisodes: 0,
            overallAccuracy: 0,
            totalReward: 0,
            expertStats: {},
            status: 'running',
        };

        console.log(`[RL] Starting training session ${sessionId}`);
        console.log(`[RL] Date range: ${this.config.startDate.toISOString().slice(0, 10)} to ${this.config.endDate.toISOString().slice(0, 10)}`);

        // Check API availability
        const available = await this.provider.isAvailable();
        if (!available) {
            console.error('[RL] Polygon API not available');
            this.session.status = 'failed';
            return this.session;
        }

        const tracker = getForecastTracker();
        let successCount = 0;

        // Train on each symbol
        for (const symbol of this.config.symbols) {
            this.session.currentSymbol = symbol;
            console.log(`[RL] Training on ${symbol}...`);

            // Fetch historical data
            const bars = await this.provider.getOHLCV(
                symbol,
                this.config.timeframe,
                this.config.startDate,
                this.config.endDate
            );

            if (bars.length < 100) {
                console.warn(`[RL] Not enough data for ${symbol}: ${bars.length} bars`);
                continue;
            }

            console.log(`[RL] Got ${bars.length} bars for ${symbol}`);

            // Walk through bars
            for (let i = 20; i < bars.length - this.config.evaluationWindowBars; i += this.config.skipBars) {
                this.session.currentDate = new Date(bars[i].timestamp).toISOString().slice(0, 10);

                for (const desk of this.config.desks) {
                    const episode = await this.runEpisode(symbol, bars, i, desk);

                    if (episode) {
                        this.episodes.push(episode);
                        this.session.episodesCompleted++;
                        this.session.totalReward += episode.reward;

                        if (episode.success) successCount++;

                        // Freeze forecast for tracking
                        const fakeId = uuidv4();
                        tracker.createForecast({
                            id: fakeId,
                            createdAt: new Date(episode.timestamp),
                            brainType: desk,
                            symbol,
                            predictedReturnMean: episode.predictedReturn,
                            predictedIntervalLow: episode.predictedReturn - 0.02,
                            predictedIntervalHigh: episode.predictedReturn + 0.02,
                            predictedProbProfit: episode.confidence,
                            confidence: episode.confidence,
                            direction: episode.predictedDirection,
                            strength: episode.confidence,
                            reasons: [episode.lessonLearned],
                            evaluationWindowHours: this.config.evaluationWindowBars,
                            evaluationWindowEnd: new Date(episode.timestamp + this.config.evaluationWindowBars * 3600000),
                            featureSnapshot: {},
                            expertContributions: episode.expertContributions,
                            mixerWeights: [],
                        });

                        // Log progress every 50 episodes
                        if (this.session.episodesCompleted % 50 === 0) {
                            this.session.overallAccuracy = successCount / this.session.episodesCompleted;
                            console.log(`[RL] Progress: ${this.session.episodesCompleted} episodes, ` +
                                `${(this.session.overallAccuracy * 100).toFixed(1)}% accuracy, ` +
                                `reward: ${this.session.totalReward.toFixed(1)}`);

                            if (onProgress) {
                                this.session.expertStats = Object.fromEntries(this.expertStats);
                                onProgress(this.session);
                            }
                        }
                    }
                }

                // Rate limiting - small delay between predictions
                await new Promise(r => setTimeout(r, 50));
            }
        }

        // Finalize session
        this.session.endTime = new Date();
        this.session.status = 'completed';
        this.session.overallAccuracy = this.session.episodesCompleted > 0
            ? successCount / this.session.episodesCompleted
            : 0;
        this.session.expertStats = Object.fromEntries(this.expertStats);

        console.log(`[RL] Training complete!`);
        console.log(`[RL] Episodes: ${this.session.episodesCompleted}`);
        console.log(`[RL] Accuracy: ${(this.session.overallAccuracy * 100).toFixed(1)}%`);
        console.log(`[RL] Total Reward: ${this.session.totalReward.toFixed(1)}`);

        // Log expert performance
        console.log(`[RL] Expert Performance:`);
        Array.from(this.expertStats.entries()).forEach(([name, stats]) => {
            if (stats.totalEpisodes > 0) {
                console.log(`  ${name}: ${(stats.accuracy * 100).toFixed(1)}% accuracy, weight: ${stats.currentWeight.toFixed(3)}`);
            }
        });

        return this.session;
    }

    /**
     * Get current session
     */
    getSession(): TrainingSession | null {
        return this.session;
    }

    /**
     * Get all episodes
     */
    getEpisodes(): EpisodeResult[] {
        return [...this.episodes];
    }

    /**
     * Get expert stats
     */
    getExpertStats(): Map<string, ExpertStats> {
        return new Map(this.expertStats);
    }

    /**
     * Get learned weights for use in production
     */
    getLearnedWeights(): Record<string, number> {
        const weights: Record<string, number> = {};
        Array.from(this.expertStats.entries()).forEach(([name, stats]) => {
            weights[name] = stats.currentWeight;
        });
        return weights;
    }
}

// Singleton
let engineInstance: ReinforcementEngine | null = null;

export function getReinforcementEngine(config?: Partial<LearningConfig>): ReinforcementEngine {
    if (!engineInstance) {
        engineInstance = new ReinforcementEngine(config);
    }
    return engineInstance;
}
