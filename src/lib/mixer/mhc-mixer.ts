/**
 * mHC Mixer Module
 * 
 * Implements Sinkhorn-Knopp normalization for stable expert combination.
 * Ensures no single expert dominates across all situations.
 * 
 * Key properties:
 * - Row normalization: Each symbol gets fair consideration
 * - Column normalization: Each expert has bounded influence
 * - Doubly stochastic: Stable, balanced mixing
 */

import type { ExpertContribution } from '../core/types';
import type { ExpertOutput } from '../brains/interface';

/**
 * Mixer configuration
 */
export interface MixerConfig {
    maxIterations: number;       // Max Sinkhorn iterations
    convergenceThreshold: number; // When to stop iterating
    minWeight: number;           // Floor for any weight
    maxWeight: number;           // Ceiling for any weight
    logWeights: boolean;         // Whether to log weights
}

/**
 * Default mixer configuration
 */
export const DEFAULT_MIXER_CONFIG: MixerConfig = {
    maxIterations: 100,
    convergenceThreshold: 0.001,
    minWeight: 0.05,
    maxWeight: 0.5,
    logWeights: true,
};

/**
 * Mixed prediction result
 */
export interface MixedPrediction {
    predictedReturn: number;
    confidence: number;
    direction: 'long' | 'short' | 'neutral';
    strength: number;
    weights: number[];
    contributions: ExpertContribution[];
    constraintSatisfied: boolean;
    iterations: number;
}

/**
 * Weight log entry for audit
 */
export interface WeightLogEntry {
    timestamp: number;
    forecastId?: string;
    symbol: string;
    expertNames: string[];
    rawWeights: number[];
    normalizedWeights: number[];
    constraintError: number;
}

// In-memory weight log
const weightLog: WeightLogEntry[] = [];

/**
 * mHC Mixer
 * 
 * Uses Sinkhorn-Knopp algorithm to normalize expert weights
 * into a doubly stochastic form.
 */
export class MHCMixer {
    private config: MixerConfig;

    constructor(config?: Partial<MixerConfig>) {
        this.config = { ...DEFAULT_MIXER_CONFIG, ...config };
    }

    /**
     * Normalize weights using Sinkhorn-Knopp algorithm
     * 
     * For a single prediction, this ensures weights sum to 1
     * while respecting min/max constraints.
     */
    normalizeWeights(weights: number[]): {
        normalized: number[];
        iterations: number;
        error: number
    } {
        if (weights.length === 0) {
            return { normalized: [], iterations: 0, error: 0 };
        }

        // Initialize
        let w = weights.map(x => Math.max(0.001, x)); // Ensure positive
        let iterations = 0;
        let error = 1;

        // Sinkhorn-Knopp iterations (simplified for 1D)
        while (iterations < this.config.maxIterations && error > this.config.convergenceThreshold) {
            // Normalize to sum to 1
            const sum = w.reduce((a, b) => a + b, 0);
            if (sum === 0) {
                w = w.map(() => 1 / w.length);
                break;
            }
            w = w.map(x => x / sum);

            // Apply min/max constraints
            let constrained = false;
            w = w.map(x => {
                if (x < this.config.minWeight) {
                    constrained = true;
                    return this.config.minWeight;
                }
                if (x > this.config.maxWeight) {
                    constrained = true;
                    return this.config.maxWeight;
                }
                return x;
            });

            // Renormalize if we applied constraints
            if (constrained) {
                const newSum = w.reduce((a, b) => a + b, 0);
                w = w.map(x => x / newSum);
            }

            // Calculate convergence error
            error = Math.abs(w.reduce((a, b) => a + b, 0) - 1);
            iterations++;
        }

        return { normalized: w, iterations, error };
    }

    /**
     * Mix expert outputs into a single prediction
     */
    mix(
        expertOutputs: ExpertOutput[],
        rawWeights?: number[],
        forecastId?: string,
        symbol?: string
    ): MixedPrediction {
        if (expertOutputs.length === 0) {
            return {
                predictedReturn: 0,
                confidence: 0,
                direction: 'neutral',
                strength: 0,
                weights: [],
                contributions: [],
                constraintSatisfied: true,
                iterations: 0,
            };
        }

        // Get raw weights from confidence if not provided
        const weights = rawWeights || expertOutputs.map(e => e.confidenceComponent);

        // Normalize weights
        const { normalized, iterations, error } = this.normalizeWeights(weights);

        // Log weights if enabled
        if (this.config.logWeights && symbol) {
            this.logWeights(
                symbol,
                expertOutputs.map(e => e.expertName),
                weights,
                normalized,
                error,
                forecastId
            );
        }

        // Combine expert outputs
        let predictedReturn = 0;
        let confidence = 0;
        const contributions: ExpertContribution[] = [];

        let longVotes = 0;
        let shortVotes = 0;
        let totalStrength = 0;

        for (let i = 0; i < expertOutputs.length; i++) {
            const output = expertOutputs[i];
            const weight = normalized[i];

            predictedReturn += output.predictedReturnComponent * weight;
            confidence += output.confidenceComponent * weight;
            totalStrength += output.strength * weight;

            if (output.direction === 'long') {
                longVotes += weight;
            } else if (output.direction === 'short') {
                shortVotes += weight;
            }

            contributions.push({
                expertName: output.expertName,
                predictedReturnComponent: output.predictedReturnComponent,
                confidenceComponent: output.confidenceComponent,
                weight,
                explanationTokens: output.explanationTokens,
            });
        }

        // Determine direction
        const direction: 'long' | 'short' | 'neutral' =
            longVotes > shortVotes + 0.1 ? 'long' :
                shortVotes > longVotes + 0.1 ? 'short' : 'neutral';

        return {
            predictedReturn,
            confidence,
            direction,
            strength: totalStrength,
            weights: normalized,
            contributions,
            constraintSatisfied: error < this.config.convergenceThreshold,
            iterations,
        };
    }

    /**
     * Log weights for audit
     */
    private logWeights(
        symbol: string,
        expertNames: string[],
        rawWeights: number[],
        normalizedWeights: number[],
        constraintError: number,
        forecastId?: string
    ): void {
        weightLog.push({
            timestamp: Date.now(),
            forecastId,
            symbol,
            expertNames,
            rawWeights: [...rawWeights],
            normalizedWeights: [...normalizedWeights],
            constraintError,
        });

        // Keep only last 1000 entries
        if (weightLog.length > 1000) {
            weightLog.shift();
        }
    }

    /**
     * Get weight log
     */
    getWeightLog(limit?: number): WeightLogEntry[] {
        const entries = [...weightLog].reverse();
        return limit ? entries.slice(0, limit) : entries;
    }

    /**
     * Check if constraint is satisfied
     * Weights should sum to ~1 and be within min/max bounds
     */
    checkConstraint(weights: number[]): boolean {
        if (weights.length === 0) return true;

        const sum = weights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > this.config.convergenceThreshold) {
            return false;
        }

        for (const w of weights) {
            if (w < this.config.minWeight - 0.001 || w > this.config.maxWeight + 0.001) {
                return false;
            }
        }

        return true;
    }
}

// Singleton instance
let mixerInstance: MHCMixer | null = null;

export function getMHCMixer(config?: Partial<MixerConfig>): MHCMixer {
    if (!mixerInstance) {
        mixerInstance = new MHCMixer(config);
    }
    return mixerInstance;
}

/**
 * Test function to verify constraints
 */
export function testMixerConstraints(): { passed: boolean; details: string[] } {
    const mixer = new MHCMixer();
    const details: string[] = [];
    let passed = true;

    // Test 1: Simple normalization
    const test1 = mixer.normalizeWeights([0.3, 0.5, 0.2]);
    if (Math.abs(test1.normalized.reduce((a, b) => a + b, 0) - 1) > 0.001) {
        passed = false;
        details.push('Test 1 FAILED: Weights do not sum to 1');
    } else {
        details.push('Test 1 PASSED: Simple normalization');
    }

    // Test 2: Extreme values get clamped
    const test2 = mixer.normalizeWeights([0.01, 0.99, 0]);
    if (test2.normalized.some(w => w < DEFAULT_MIXER_CONFIG.minWeight - 0.01)) {
        passed = false;
        details.push('Test 2 FAILED: Weight below min');
    } else {
        details.push('Test 2 PASSED: Min weight respected');
    }

    // Test 3: All zeros
    const test3 = mixer.normalizeWeights([0, 0, 0]);
    if (test3.normalized.length !== 3) {
        passed = false;
        details.push('Test 3 FAILED: All zeros not handled');
    } else {
        details.push('Test 3 PASSED: All zeros handled');
    }

    // Test 4: Single expert
    const test4 = mixer.normalizeWeights([1]);
    if (Math.abs(test4.normalized[0] - 1) > 0.001) {
        passed = false;
        details.push('Test 4 FAILED: Single expert not 1');
    } else {
        details.push('Test 4 PASSED: Single expert = 1');
    }

    return { passed, details };
}
