/**
 * Expert System Types
 * 
 * Types for the multi-expert ranking engine with mHC-inspired mixing.
 */

// Trading setup signal from a single expert
export interface ExpertSignal {
    expertName: string;
    symbol: string;
    deskType: DeskType;

    // Signal direction and strength
    direction: 'long' | 'short' | 'neutral';
    strength: number;      // 0-1 signal strength
    confidence: number;    // 0-1 how confident the expert is

    // Reasoning
    reasons: string[];     // Human-readable explanations
    technicalNotes: string[]; // Technical details for pro mode

    // Risk parameters
    invalidation?: number; // Price level that invalidates the setup
    target?: number;       // Target price
    riskReward?: number;   // Risk/reward ratio

    // Metadata
    timestamp: number;
    expiresAt?: number;    // When signal becomes stale
}

// Desk types for routing signals
export type DeskType =
    | 'day-trading'
    | 'options'
    | 'swing'
    | 'investing';

// Combined candidate from multiple experts
export interface RankedCandidate {
    symbol: string;
    name: string;
    deskType: DeskType;

    // Blended score (from mHC mixer)
    score: number;           // 0-100 final score
    confidence: number;      // 0-1 blended confidence

    // Setup info
    setupType: string;       // Primary setup classification
    direction: 'long' | 'short' | 'neutral';

    // Risk parameters (consensus)
    invalidation?: number;
    target?: number;
    riskReward?: number;

    // Contributing signals
    signals: ExpertSignal[];
    expertContributions: ExpertContribution[];

    // Explanations
    reasons: string[];       // Top reasons across experts
    warnings?: string[];     // Risk warnings

    // Metadata
    rankedAt: number;
    signalCount: number;
}

// Individual expert's contribution to final score
export interface ExpertContribution {
    expertName: string;
    rawScore: number;        // Expert's raw signal strength
    weight: number;          // Expert's weight in mixer (after normalization)
    contribution: number;    // rawScore * weight = contribution to final
}

// Expert metadata and calibration
export interface ExpertConfig {
    name: string;
    description: string;
    supportedDesks: DeskType[];
    defaultWeight: number;   // Starting weight before calibration

    // Performance tracking
    accuracy?: number;       // Historical accuracy
    signalCount?: number;    // Total signals generated
}

// Mixer configuration
export interface MixerConfig {
    // Sinkhorn-Knopp parameters
    sinkhornIterations: number;  // Typically 10-20
    spectralNormMax: number;     // Usually 1.0
    convergenceThreshold: number;

    // Blend parameters
    minExpertsForSignal: number; // Minimum experts needed
    scoreThreshold: number;      // Minimum score to rank

    // Feature flags
    enableExplanations: boolean;
    enableAuditLog: boolean;
}

// Audit log entry for mixer decisions
export interface MixerAuditEntry {
    id: string;
    timestamp: number;
    symbol: string;
    deskType: DeskType;

    // Input state
    inputSignals: ExpertSignal[];
    expertWeights: Record<string, number>;

    // Normalization details
    preNormWeights: number[];
    postNormWeights: number[];
    sinkhornIterations: number;
    rowSumError: number;
    colSumError: number;

    // Output
    finalScore: number;
    finalRank: number;

    // Decision
    action: 'included' | 'excluded' | 'warning';
    reason: string;
}

// Expert base interface
export interface Expert {
    readonly config: ExpertConfig;

    // Generate signals for symbols
    analyze(
        symbols: string[],
        deskType: DeskType
    ): Promise<ExpertSignal[]>;

    // Get explanation for a specific signal
    explain(signal: ExpertSignal): string;
}

// Market context for experts
export interface MarketContext {
    vix?: number;
    marketRegime: 'risk-on' | 'risk-off' | 'neutral';
    sectorStrength?: Record<string, number>;
    breadth?: number;      // % of stocks above 200MA
}
