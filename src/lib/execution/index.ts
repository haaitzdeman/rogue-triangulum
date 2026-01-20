/**
 * Execution Module Index
 * 
 * V1.1: Paper/Live trading with MHC safety
 */

// TradeGate - Single execution authority
export {
    TradeGate,
    getTradeGate,
    getTradeGateStatus,
    DEFAULT_GUARDRAILS,
    // Mode management
    getTradingMode,
    setTradingMode,
    isLiveUnlocked,
    getLiveUnlockRemaining,
    unlockLiveTrading,
    lockLiveTrading,
    // Intent creation
    createTradeIntent,
} from './trade-gate';

export type { GuardrailConfig } from './trade-gate';

// Execution types
export type {
    TradingMode,
    TradeIntent,
    ExecutionResult,
    OrderSide,
    OrderType,
    TimeInForce,
    PaperExecution,
    Position,
    MHCResult,
} from './execution-types';

export {
    APPROVED_WATCHLIST,
    MHC_THRESHOLDS,
    SLIPPAGE_CONFIG,
} from './execution-types';

// Order manager
export { OrderManager, getOrderManager } from './order-manager';
export type { OrderLogEntry, OrderStatus } from './order-manager';

// MHC
export { checkMHC, isTradeBlocked, formatMHCReasons } from '../risk/mhc';
