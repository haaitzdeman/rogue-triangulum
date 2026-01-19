/**
 * Core Types
 * 
 * Fundamental types used across all modules.
 */

// Execution mode - PAPER is safe sandbox, LIVE is real trading
export type ExecutionMode = 'PAPER' | 'LIVE';

// Desk types for routing
export type DeskType = 'day-trading' | 'options' | 'swing' | 'investing';

// Market context passed to brains
export interface MarketContext {
    timestamp: number;
    marketOpen: boolean;
    preMarket: boolean;
    afterHours: boolean;
    vix?: number;
    marketRegime: 'risk-on' | 'risk-off' | 'neutral' | 'unknown';
    sectorStrength?: Record<string, number>;
    breadth?: number;
}

// Trade direction
export type TradeDirection = 'long' | 'short';

// Trade intent - proposal from brain to TradeGate
export interface TradeIntent {
    id: string;
    createdAt: Date;

    // Source
    brainType: DeskType;
    forecastId: string;

    // Trade details
    symbol: string;
    direction: TradeDirection;
    quantity: number;

    // Order type
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
    limitPrice?: number;
    stopPrice?: number;

    // Risk
    stopLoss?: number;
    takeProfit?: number;
    maxRiskDollars: number;

    // Validity
    timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
    expiresAt?: Date;

    // Strategy metadata
    strategy?: string;
    setupType?: string;
    notes?: string;
}

// Brain prediction output
export interface BrainPrediction {
    id: string;
    createdAt: Date;

    // Source
    brainType: DeskType;
    symbol: string;

    // V1: Fake prediction fields removed - these are optional and should NOT be displayed
    // Keeping for type backwards compatibility but should be null
    predictedReturnMean?: number | null;      // DEPRECATED - don't display
    predictedIntervalLow?: number | null;     // DEPRECATED - don't display
    predictedIntervalHigh?: number | null;    // DEPRECATED - don't display
    predictedProbProfit?: number | null;      // DEPRECATED - don't display
    confidence: number;                        // Still used for filtering

    // V1: EXPLAINABLE OUTPUTS - these are the real values
    expectedMoveATR?: number;                  // Expected move in ATR units
    atrDollars?: number;                       // ATR value in dollars
    atrPercent?: number;                       // ATR as % of price
    riskStop: number;                          // Stop loss price
    targetPrice: number;                       // Target price (derived from R-multiple)
    targetR?: number;                          // R-multiple target (e.g., 2R)

    // Horizon
    evaluationWindowHours: number;
    evaluationWindowEnd: Date;

    // Direction signal
    direction: TradeDirection | 'neutral';
    strength: number;                 // Signal strength (0-1)

    // Breakdown
    expertContributions: ExpertContribution[];
    mixerWeights: number[];

    // Feature snapshot for audit
    featureSnapshot: Record<string, number>;

    // Explanation
    reasons: string[];
    warnings?: string[];
    invalidation?: string;
}

// Expert contribution to final prediction
export interface ExpertContribution {
    expertName: string;
    predictedReturnComponent: number;
    confidenceComponent: number;
    weight: number;
    explanationTokens: string[];
}

// Feature vector from brain
export interface FeatureVector {
    symbol: string;
    timestamp: number;
    features: Record<string, number>;
    metadata: Record<string, string>;
}

// Candidate from brain scan
export interface Candidate {
    symbol: string;
    name?: string;
    score: number;
    direction: TradeDirection | 'neutral';
    reasons: string[];
    timestamp: number;
}

// Ranked candidate with full prediction
export interface RankedCandidate extends Candidate {
    prediction?: BrainPrediction;
    rank: number;
}

// Guardrail configuration
export interface GuardrailConfig {
    // Loss limits
    maxDailyRealizedLoss: number;
    maxDailyUnrealizedLoss: number;
    maxRiskPerTrade: number;

    // Exposure limits
    maxTotalExposure: number;
    maxSymbolExposure: number;
    maxOpenPositions: number;

    // Activity limits
    maxTradesPerDay: number;
    maxTradesPerHour: number;

    // Allowed lists
    allowedSymbols?: string[];          // If set, whitelist mode
    blockedSymbols?: string[];          // Always blocked
    allowedStrategies?: string[];

    // Time rules
    allowPreMarket: boolean;
    allowAfterHours: boolean;
    noTradeWindowStart?: string;        // HH:MM format
    noTradeWindowEnd?: string;

    // Event rules
    blockOnEarnings: boolean;
    blockOnFOMC: boolean;
    blockOnCPI: boolean;

    // Kill switch state
    killSwitchActive: boolean;
    killSwitchCooldownMinutes: number;
}

// Order result from TradeGate
export interface OrderResult {
    success: boolean;
    orderId?: string;
    status: 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled';
    message?: string;
    filledQuantity?: number;
    filledPrice?: number;
    commission?: number;
    timestamp: Date;
}

// Position from broker
export interface Position {
    symbol: string;
    quantity: number;
    side: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
}

// Order from broker
export interface Order {
    id: string;
    symbol: string;
    direction: TradeDirection;
    quantity: number;
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
    limitPrice?: number;
    stopPrice?: number;
    status: 'pending' | 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';
    filledQuantity: number;
    avgFillPrice?: number;
    createdAt: Date;
    updatedAt: Date;

    // Linked forecast
    forecastId?: string;
    intentId?: string;
}

// Explanation for UI
export interface Explanation {
    summary: string;
    beginnerSummary: string;
    whyThisPick: string;
    whatWouldInvalidate: string;
    details: string[];
    warnings: string[];
    riskLevel: 'low' | 'medium' | 'high';
}

// Accuracy stats
export interface AccuracyStats {
    totalForecasts: number;
    evaluated: number;

    // Directional
    directionalAccuracy: number;

    // Return
    meanError: number;
    meanAbsoluteError: number;

    // Calibration
    intervalCoverage: number;        // % of actuals within predicted interval

    // By brain
    byBrain: Record<DeskType, {
        forecasts: number;
        accuracy: number;
        mae: number;
    }>;
}

// Readiness gate result
export interface ReadinessGateResult {
    name: string;
    passed: boolean;
    reason: string;
    details?: string;
}
