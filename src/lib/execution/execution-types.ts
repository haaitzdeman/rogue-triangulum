/**
 * Execution Types
 * 
 * Core types for the trading execution layer.
 * V1.1: Paper trading with realistic simulation.
 * 
 * TERMINOLOGY: "execute", "fill", "order" - NOT "predict" or "learn"
 */

/**
 * Trading mode - paper (simulated) or live (real broker)
 */
export type TradingMode = 'paper' | 'live';

/**
 * Order side
 */
export type OrderSide = 'buy' | 'sell';

/**
 * Order type
 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/**
 * Time in force
 */
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';

/**
 * Trade intent - proposed by orchestrator/brain, executed by TradeGate
 */
export interface TradeIntent {
    // Identification
    id: string;                          // Unique intent ID

    // Symbol
    symbol: string;

    // Direction and quantity
    side: OrderSide;
    quantity: number;                    // Shares/contracts

    // Pricing
    orderType: OrderType;
    limitPrice?: number;                 // For limit/stop_limit
    stopPrice?: number;                  // For stop/stop_limit

    // Risk management
    stopLoss?: number;                   // Stop loss price
    takeProfit?: number;                 // Take profit price

    // Position sizing
    positionValue: number;               // Total value in $
    positionPercent: number;             // Percent of account

    // Source tracking
    source: {
        desk: string;                    // e.g., "swing"
        strategyName: string;
        signalId?: string;               // Link to journal signal
        score: number;
        confidence: number;
        reasons: string[];
    };

    // Time
    timeInForce: TimeInForce;
    createdAt: string;                   // ISO timestamp
}

/**
 * Execution result - returned by TradeGate
 */
export interface ExecutionResult {
    success: boolean;

    // Order details (if successful)
    orderId?: string;
    fillPrice?: number;
    fillQuantity?: number;
    filledAt?: string;                   // ISO timestamp

    // Error details (if failed)
    error?: string;
    errorCode?: 'not_configured' | 'rejected' | 'insufficient_funds' | 'invalid_order' | 'mhc_rejected' | 'live_locked';

    // Mode info
    mode: TradingMode;
    simulated: boolean;

    // Execution details
    slippageApplied?: number;            // Slippage in %
    commission?: number;                 // Commission in $
}

/**
 * Paper execution record - persisted to JSON
 */
export interface PaperExecution {
    id: string;
    intentId: string;
    symbol: string;
    side: OrderSide;
    quantity: number;

    // Pricing
    requestedPrice: number;              // Quote at time of submit
    fillPrice: number;                   // After slippage
    slippagePercent: number;

    // Value
    value: number;                       // fillPrice * quantity
    commission: number;

    // Source
    strategyName: string;
    signalId?: string;

    // Status
    status: 'filled' | 'cancelled' | 'rejected';
    filledAt: string;
    createdAt: string;
}

/**
 * Paper executions store
 */
export interface PaperExecutionStore {
    executions: PaperExecution[];
    lastUpdated: string;
    version: 'V1';
}

/**
 * Position (for portfolio tracking)
 */
export interface Position {
    symbol: string;
    quantity: number;
    avgEntryPrice: number;
    currentPrice?: number;
    unrealizedPnL?: number;
    realizedPnL: number;
    side: 'long' | 'short';
}

/**
 * MHC (Manual Human Check) result
 */
export interface MHCResult {
    requiresMHC: boolean;
    reasons: string[];
    blockedReasons?: string[];           // If any, trade cannot proceed even with approval
}

/**
 * Approved watchlist for MHC
 */
export const APPROVED_WATCHLIST = [
    'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'GOOGL', 'AMZN', 'META',
    'SPY', 'QQQ', 'AMD', 'NFLX', 'DIS', 'BA', 'JPM', 'V', 'MA',
];

/**
 * MHC thresholds
 */
export const MHC_THRESHOLDS = {
    MIN_CONFIDENCE: 0.70,
    MIN_SCORE: 75,
    MAX_POSITION_VALUE: 1000,            // $1000 max without MHC
};

/**
 * Slippage configuration
 */
export const SLIPPAGE_CONFIG = {
    LIQUID_SYMBOLS: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN', 'META', 'SPY', 'QQQ'],
    SLIPPAGE_LIQUID: 0.0002,             // 0.02%
    SLIPPAGE_ILLIQUID: 0.001,            // 0.10%
};
