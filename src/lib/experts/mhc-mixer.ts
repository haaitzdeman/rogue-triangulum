/**
 * mHC Mixer - Multi-Expert Ranking Engine
 * 
 * Uses Sinkhorn-Knopp normalization to blend expert signals into
 * stable, interpretable rankings that satisfy:
 * 1. Row constraint: each symbol gets fair consideration
 * 2. Column constraint: each expert has bounded influence
 * 
 * This ensures no single expert can dominate rankings.
 */

import type {
    Expert,
    ExpertSignal,
    RankedCandidate,
    ExpertContribution,
    DeskType,
    MixerConfig,
    MixerAuditEntry,
} from './types';
import { v4 as uuidv4 } from 'uuid';

// Default mixer configuration
const DEFAULT_CONFIG: MixerConfig = {
    sinkhornIterations: 15,
    spectralNormMax: 1.0,
    convergenceThreshold: 0.001,
    minExpertsForSignal: 2,
    scoreThreshold: 40,
    enableExplanations: true,
    enableAuditLog: false,
};

export class MHCMixer {
    private experts: Expert[] = [];
    private config: MixerConfig;
    private auditLog: MixerAuditEntry[] = [];
    private expertWeights: Map<string, number> = new Map();

    constructor(config: Partial<MixerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Register experts for the mixer
     */
    registerExperts(experts: Expert[]): void {
        this.experts = experts;

        // Initialize weights from expert defaults
        for (const expert of experts) {
            this.expertWeights.set(expert.config.name, expert.config.defaultWeight);
        }
    }

    /**
     * Update expert weight (e.g., from calibration)
     */
    setExpertWeight(expertName: string, weight: number): void {
        this.expertWeights.set(expertName, Math.max(0, Math.min(1, weight)));
    }

    /**
     * Main mixing function - generates ranked candidates
     */
    async generateRankings(
        symbols: string[],
        deskType: DeskType
    ): Promise<RankedCandidate[]> {
        // 1. Gather signals from all experts
        const signalsBySymbol = await this.gatherSignals(symbols, deskType);

        // 2. Build signal matrix and apply Sinkhorn-Knopp
        const normalizedMatrix = this.sinkhornKnopp(signalsBySymbol);

        // 3. Compute blended scores
        const candidates = this.computeScores(signalsBySymbol, normalizedMatrix, deskType);

        // 4. Filter and sort
        const ranked = candidates
            .filter(c => c.score >= this.config.scoreThreshold)
            .sort((a, b) => b.score - a.score);

        return ranked;
    }

    /**
     * Gather signals from all experts for all symbols
     */
    private async gatherSignals(
        symbols: string[],
        deskType: DeskType
    ): Promise<Map<string, ExpertSignal[]>> {
        const signalsBySymbol = new Map<string, ExpertSignal[]>();

        // Initialize
        for (const symbol of symbols) {
            signalsBySymbol.set(symbol, []);
        }

        // Gather from each expert
        for (const expert of this.experts) {
            if (!expert.config.supportedDesks.includes(deskType)) {
                continue;
            }

            try {
                const signals = await expert.analyze(symbols, deskType);

                for (const signal of signals) {
                    const existing = signalsBySymbol.get(signal.symbol) || [];
                    existing.push(signal);
                    signalsBySymbol.set(signal.symbol, existing);
                }
            } catch (error) {
                console.error(`Expert ${expert.config.name} failed:`, error);
            }
        }

        return signalsBySymbol;
    }

    /**
     * Sinkhorn-Knopp normalization
     * 
     * Iteratively normalizes rows and columns to achieve
     * doubly stochastic matrix (rows and columns sum to 1).
     */
    private sinkhornKnopp(
        signalsBySymbol: Map<string, ExpertSignal[]>
    ): Map<string, Map<string, number>> {
        const symbols = Array.from(signalsBySymbol.keys());
        const expertNames = this.experts.map(e => e.config.name);

        // Build initial weight matrix
        // matrix[symbol][expert] = weight contribution
        const matrix: number[][] = [];

        for (let i = 0; i < symbols.length; i++) {
            const row: number[] = [];
            const signals = signalsBySymbol.get(symbols[i]) || [];

            for (const expertName of expertNames) {
                const signal = signals.find(s => s.expertName === expertName);
                const baseWeight = this.expertWeights.get(expertName) || 0.1;

                if (signal && signal.direction !== 'neutral') {
                    // Weight = base weight * signal strength * confidence
                    row.push(baseWeight * signal.strength * signal.confidence);
                } else {
                    row.push(0);
                }
            }
            matrix.push(row);
        }

        // Apply Sinkhorn-Knopp iterations
        let rowErrors: number[] = [];
        let colErrors: number[] = [];

        for (let iter = 0; iter < this.config.sinkhornIterations; iter++) {
            // Normalize rows (each symbol gets fair consideration)
            rowErrors = [];
            for (let i = 0; i < matrix.length; i++) {
                const rowSum = matrix[i].reduce((a, b) => a + b, 0);
                if (rowSum > 0) {
                    for (let j = 0; j < matrix[i].length; j++) {
                        matrix[i][j] /= rowSum;
                    }
                    rowErrors.push(Math.abs(1 - rowSum));
                }
            }

            // Normalize columns (each expert has bounded influence)
            colErrors = [];
            for (let j = 0; j < expertNames.length; j++) {
                let colSum = 0;
                for (let i = 0; i < matrix.length; i++) {
                    colSum += matrix[i][j];
                }
                if (colSum > 0) {
                    for (let i = 0; i < matrix.length; i++) {
                        matrix[i][j] /= colSum;
                    }
                    colErrors.push(Math.abs(1 - colSum));
                }
            }

            // Check convergence
            const maxRowError = Math.max(...rowErrors, 0);
            const maxColError = Math.max(...colErrors, 0);

            if (maxRowError < this.config.convergenceThreshold &&
                maxColError < this.config.convergenceThreshold) {
                break;
            }
        }

        // Convert back to map structure
        const result = new Map<string, Map<string, number>>();

        for (let i = 0; i < symbols.length; i++) {
            const expertWeights = new Map<string, number>();
            for (let j = 0; j < expertNames.length; j++) {
                expertWeights.set(expertNames[j], matrix[i][j]);
            }
            result.set(symbols[i], expertWeights);
        }

        return result;
    }

    /**
     * Compute final blended scores from normalized weights
     */
    private computeScores(
        signalsBySymbol: Map<string, ExpertSignal[]>,
        normalizedWeights: Map<string, Map<string, number>>,
        deskType: DeskType
    ): RankedCandidate[] {
        const candidates: RankedCandidate[] = [];

        const entries = Array.from(signalsBySymbol.entries());
        for (const [symbol, signals] of entries) {
            const weights = normalizedWeights.get(symbol);
            if (!weights) continue;

            // Filter to non-neutral signals
            const activeSignals = signals.filter(s => s.direction !== 'neutral');

            if (activeSignals.length < this.config.minExpertsForSignal) {
                continue; // Not enough expert agreement
            }

            // Compute contributions
            const contributions: ExpertContribution[] = [];
            let totalScore = 0;
            let totalConfidence = 0;
            let totalWeight = 0;

            for (const signal of activeSignals) {
                const weight = weights.get(signal.expertName) || 0;
                const contribution = signal.strength * weight * 100;

                contributions.push({
                    expertName: signal.expertName,
                    rawScore: signal.strength,
                    weight,
                    contribution,
                });

                totalScore += contribution;
                totalConfidence += signal.confidence * weight;
                totalWeight += weight;
            }

            // Normalize confidence
            const blendedConfidence = totalWeight > 0
                ? totalConfidence / totalWeight
                : 0.5;

            // Determine consensus direction
            const longCount = activeSignals.filter(s => s.direction === 'long').length;
            const shortCount = activeSignals.filter(s => s.direction === 'short').length;
            const direction = longCount > shortCount ? 'long' :
                shortCount > longCount ? 'short' : 'neutral';

            // Aggregate reasons (top 3)
            const allReasons = activeSignals.flatMap(s => s.reasons);
            const reasons = Array.from(new Set(allReasons)).slice(0, 3);

            // Consensus invalidation (most conservative)
            const invalidations = activeSignals
                .map(s => s.invalidation)
                .filter((v): v is number => v !== undefined);
            const invalidation = direction === 'long'
                ? Math.max(...invalidations, 0)
                : Math.min(...invalidations, Infinity);

            // Primary setup type (from highest weight signal)
            const topSignal = activeSignals.reduce((best, signal) => {
                const weight = weights.get(signal.expertName) || 0;
                const bestWeight = weights.get(best.expertName) || 0;
                return weight > bestWeight ? signal : best;
            });

            candidates.push({
                symbol,
                name: symbol, // Would be enriched with symbol info
                deskType,
                score: Math.min(100, Math.round(totalScore)),
                confidence: blendedConfidence,
                setupType: topSignal.expertName,
                direction,
                invalidation: invalidation !== 0 && invalidation !== Infinity ? invalidation : undefined,
                signals: activeSignals,
                expertContributions: contributions,
                reasons,
                rankedAt: Date.now(),
                signalCount: activeSignals.length,
            });

            // Audit log
            if (this.config.enableAuditLog) {
                this.auditLog.push({
                    id: uuidv4(),
                    timestamp: Date.now(),
                    symbol,
                    deskType,
                    inputSignals: activeSignals,
                    expertWeights: Object.fromEntries(this.expertWeights),
                    preNormWeights: activeSignals.map(s => this.expertWeights.get(s.expertName) || 0),
                    postNormWeights: activeSignals.map(s => weights.get(s.expertName) || 0),
                    sinkhornIterations: this.config.sinkhornIterations,
                    rowSumError: 0,
                    colSumError: 0,
                    finalScore: Math.round(totalScore),
                    finalRank: 0, // Set after sorting
                    action: totalScore >= this.config.scoreThreshold ? 'included' : 'excluded',
                    reason: totalScore >= this.config.scoreThreshold
                        ? 'Score above threshold'
                        : `Score ${Math.round(totalScore)} below threshold ${this.config.scoreThreshold}`,
                });
            }
        }

        return candidates;
    }

    /**
     * Get audit log
     */
    getAuditLog(): MixerAuditEntry[] {
        return [...this.auditLog];
    }

    /**
     * Clear audit log
     */
    clearAuditLog(): void {
        this.auditLog = [];
    }
}
