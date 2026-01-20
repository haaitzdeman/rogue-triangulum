/**
 * Signal Journal Types
 * 
 * Data model for tracking scanner signals and evaluating outcomes.
 * V1: No ML - pure outcome tracking against real market data.
 * 
 * TERMINOLOGY: "tracking", "evaluation", "performance" - NOT "learning" or "AI"
 */

/**
 * Signal record - persisted when scanner generates a candidate
 */
export interface SignalRecord {
    // Identification
    id: string;                          // Deterministic: ${symbol}-${signalBarTimestamp}-${strategyName}
    version: 'V1' | 'V1-SEED';           // Schema version (V1-SEED for test data, excluded from stats)

    // Symbol & Strategy
    symbol: string;
    strategyName: string;                // e.g., "Momentum"
    setupType: string;                   // e.g., "RSI Oversold + MACD Bullish"
    direction: 'long' | 'short';

    // Score & Confidence
    score: number;                       // 0-100
    confidence: number;                  // 0-1
    reasons: string[];                   // Human-readable reasons

    // Timing (bar-indexed, not calendar)
    signalBarTimestamp: number;          // Timestamp of bar that generated signal (D)
    entryBarTimestamp: number | null;    // Timestamp of entry bar (D+1), null if not yet known
    referenceEntryDate: string;          // ISO date of expected entry (D+1)
    referenceEntryPrice: number | null;  // D+1 open price, null until fetched

    // Risk/Reward
    riskStop: number;                    // Stop loss price
    targetPrice: number;                 // Target price
    targetR: number;                     // R-multiple (e.g., 2)
    atrDollars: number;                  // ATR in $
    atrPercent: number;                  // ATR as %

    // Regime tags (computed at signal time)
    regimeTrending: boolean;             // ADX > 25
    regimeHighVol: boolean;              // ATR% > 2%

    // Evaluation config
    horizonDays: number;                 // Default 7 (evaluated at 1/3/7/10 bars)

    // Status
    status: 'pending' | 'evaluated';
    createdAt: string;                   // ISO timestamp
}

/**
 * Signal outcome - computed after horizon passes
 */
export interface SignalOutcome {
    signalId: string;                    // FK to SignalRecord.id
    evaluatedAt: string;                 // ISO timestamp

    // Returns at different horizons (bar-indexed)
    entryPrice: number;                  // Actual entry price (D+1 open)
    return1Bar: number | null;           // Return at bar +1 close
    return3Bar: number | null;           // Return at bar +3 close
    return7Bar: number | null;           // Return at bar +7 close
    return10Bar: number | null;          // Return at bar +10 close

    // Excursion metrics
    mfe: number;                         // Max Favorable Excursion %
    mae: number;                         // Max Adverse Excursion %

    // Exit simulation
    hitTargetFirst: boolean;             // Would have hit target before stop
    hitStopFirst: boolean;               // Would have hit stop before target
    exitReason: 'target' | 'stop' | 'time';
    exitBar: number;                     // Which bar exited (1-10)
    exitPrice: number;                   // Price at exit

    // Error tracking
    expectedMove: number;                // Expected move (based on ATR/target)
    realizedMove: number;                // Actual move at horizon
    errorVsExpected: number;             // Difference
}

/**
 * Journal store structure (JSON file - server-side only)
 */
export interface SignalStore {
    signals: SignalRecord[];
    outcomes: SignalOutcome[];
    lastUpdated: string;
    version: 'V1';
}

/**
 * Aggregated stats for UI
 */
export interface SignalJournalStats {
    totalSignals: number;
    evaluated: number;
    pending: number;

    // Overall performance
    avgMFE: number;
    avgMAE: number;
    hitTargetRate: number;
    hitStopRate: number;
    timeoutRate: number;

    // By strategy
    byStrategy: Record<string, StrategyPerformance>;

    // By regime
    byRegime: {
        trending: RegimePerformance;
        choppy: RegimePerformance;
        highVol: RegimePerformance;
        lowVol: RegimePerformance;
    };

    // By score bucket
    byScoreBucket: Record<string, BucketPerformance>;
}

export interface StrategyPerformance {
    count: number;
    avgScore: number;
    hitTargetRate: number;
    avgMFE: number;
    avgMAE: number;
}

export interface RegimePerformance {
    count: number;
    hitTargetRate: number;
    avgMFE: number;
    avgMAE: number;
}

export interface BucketPerformance {
    count: number;
    hitTargetRate: number;
    avgMFE: number;
    avgMAE: number;
}

/**
 * API request/response types
 */
export interface RecordSignalsRequest {
    signals: Omit<SignalRecord, 'id' | 'version' | 'status' | 'createdAt'>[];
}

export interface EvaluateSignalsRequest {
    forceReEvaluate?: boolean;           // Re-evaluate already evaluated signals
}

export interface GetJournalRequest {
    symbol?: string;
    strategy?: string;
    status?: 'pending' | 'evaluated' | 'all';
    startDate?: string;
    endDate?: string;
    limit?: number;
}

export interface JournalApiResponse {
    signals: SignalRecord[];
    outcomes: SignalOutcome[];
    stats: SignalJournalStats;
}

/**
 * Input from Orchestrator to Recorder
 */
export interface CandidateForRecording {
    symbol: string;
    strategyName: string;
    setupType: string;
    direction: 'long' | 'short';
    score: number;
    confidence: number;
    reasons: string[];
    signalBarTimestamp: number;
    referenceEntryDate: string;
    riskStop: number;
    targetPrice: number;
    targetR: number;
    atrDollars: number;
    atrPercent: number;
    regimeTrending: boolean;
    regimeHighVol: boolean;
    horizonDays: number;
}
