/**
 * TradeGate Service
 * 
 * The ONLY module allowed to execute trades.
 * Enforces all guardrails and risk limits.
 * Supports PAPER and LIVE modes.
 */

import type {
    ExecutionMode,
    TradeIntent,
    OrderResult,
    Position,
    Order,
    GuardrailConfig,
} from '../core/types';

/**
 * Default guardrails (conservative)
 */
export const DEFAULT_GUARDRAILS: GuardrailConfig = {
    // Loss limits
    maxDailyRealizedLoss: 500,
    maxDailyUnrealizedLoss: 1000,
    maxRiskPerTrade: 100,

    // Exposure limits
    maxTotalExposure: 10000,
    maxSymbolExposure: 2000,
    maxOpenPositions: 5,

    // Activity limits
    maxTradesPerDay: 10,
    maxTradesPerHour: 3,

    // Time rules
    allowPreMarket: false,
    allowAfterHours: false,

    // Event rules
    blockOnEarnings: true,
    blockOnFOMC: true,
    blockOnCPI: true,

    // Kill switch
    killSwitchActive: false,
    killSwitchCooldownMinutes: 30,
};

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
    passed: boolean;
    violations: string[];
    warnings: string[];
}

/**
 * TradeGate Interface
 */
export interface ITradeGate {
    readonly mode: ExecutionMode;
    readonly guardrails: GuardrailConfig;

    // Mode control
    setMode(mode: ExecutionMode): Promise<boolean>;

    // Order management
    submitIntent(intent: TradeIntent): Promise<OrderResult>;
    cancelOrder(orderId: string): Promise<void>;
    cancelAllOrders(): Promise<void>;

    // Kill switch
    activateKillSwitch(): Promise<void>;
    deactivateKillSwitch(): Promise<boolean>;

    // State queries
    getOpenOrders(): Promise<Order[]>;
    getPositions(): Promise<Position[]>;
    getDailyPnL(): Promise<number>;
    getTradesToday(): Promise<number>;

    // Guardrail checks
    checkGuardrails(intent: TradeIntent): GuardrailCheckResult;
    updateGuardrails(config: Partial<GuardrailConfig>): void;
}

/**
 * TradeGate Implementation
 */
export class TradeGate implements ITradeGate {
    private _mode: ExecutionMode = 'PAPER';
    private _guardrails: GuardrailConfig;
    private _killSwitchActivatedAt: Date | null = null;

    // State tracking
    private dailyRealizedPnL: number = 0;
    private tradesToday: number = 0;
    private tradesThisHour: number = 0;
    private lastTradeTime: Date | null = null;
    private openOrders: Order[] = [];
    private positions: Position[] = [];

    constructor(guardrails?: Partial<GuardrailConfig>) {
        this._guardrails = { ...DEFAULT_GUARDRAILS, ...guardrails };
    }

    get mode(): ExecutionMode {
        return this._mode;
    }

    get guardrails(): GuardrailConfig {
        return { ...this._guardrails };
    }

    /**
     * Set execution mode (PAPER or LIVE)
     * LIVE mode requires additional checks (handled by readiness gates)
     */
    async setMode(mode: ExecutionMode): Promise<boolean> {
        if (mode === 'LIVE' && this._mode === 'PAPER') {
            console.warn('[TradeGate] Switching to LIVE mode - ensure readiness gates passed');
        }

        this._mode = mode;
        console.log(`[TradeGate] Mode set to: ${mode}`);
        return true;
    }

    /**
     * Submit a trade intent
     * Checks all guardrails before executing
     */
    async submitIntent(intent: TradeIntent): Promise<OrderResult> {
        console.log(`[TradeGate] Submitting intent: ${intent.symbol} ${intent.direction}`);

        // Check kill switch
        if (this._guardrails.killSwitchActive) {
            return {
                success: false,
                status: 'rejected',
                message: 'Kill switch is active',
                timestamp: new Date(),
            };
        }

        // Check guardrails
        const check = this.checkGuardrails(intent);
        if (!check.passed) {
            return {
                success: false,
                status: 'rejected',
                message: `Guardrail violation: ${check.violations.join(', ')}`,
                timestamp: new Date(),
            };
        }

        // Log warnings but proceed
        if (check.warnings.length > 0) {
            console.warn(`[TradeGate] Warnings: ${check.warnings.join(', ')}`);
        }

        // Execute based on mode
        if (this._mode === 'PAPER') {
            return this.executePaperOrder(intent);
        } else {
            return this.executeLiveOrder(intent);
        }
    }

    /**
     * Execute paper order (simulated)
     */
    private async executePaperOrder(intent: TradeIntent): Promise<OrderResult> {
        // Simulate order execution
        const orderId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create order record
        const order: Order = {
            id: orderId,
            symbol: intent.symbol,
            direction: intent.direction,
            quantity: intent.quantity,
            orderType: intent.orderType,
            limitPrice: intent.limitPrice,
            stopPrice: intent.stopPrice,
            status: 'filled', // Paper orders fill immediately
            filledQuantity: intent.quantity,
            avgFillPrice: intent.limitPrice || 100, // Mock price
            createdAt: new Date(),
            updatedAt: new Date(),
            forecastId: intent.forecastId,
            intentId: intent.id,
        };

        // Update tracking
        this.tradesToday++;
        this.tradesThisHour++;
        this.lastTradeTime = new Date();

        // Log
        console.log(`[TradeGate] Paper order filled: ${orderId}`);

        return {
            success: true,
            orderId,
            status: 'filled',
            filledQuantity: intent.quantity,
            filledPrice: order.avgFillPrice,
            timestamp: new Date(),
        };
    }

    /**
     * Execute live order (real broker)
     * STUB - to be implemented with broker adapter
     */
    private async executeLiveOrder(intent: TradeIntent): Promise<OrderResult> {
        console.log(`[TradeGate] LIVE order would be submitted: ${intent.symbol}`);

        // TODO: Implement broker adapter
        return {
            success: false,
            status: 'rejected',
            message: 'LIVE trading not yet implemented',
            timestamp: new Date(),
        };
    }

    /**
     * Cancel a specific order
     */
    async cancelOrder(orderId: string): Promise<void> {
        console.log(`[TradeGate] Cancelling order: ${orderId}`);
        this.openOrders = this.openOrders.filter(o => o.id !== orderId);
    }

    /**
     * Cancel all open orders
     */
    async cancelAllOrders(): Promise<void> {
        console.log(`[TradeGate] Cancelling all orders (${this.openOrders.length})`);
        this.openOrders = [];
    }

    /**
     * Activate kill switch
     * Cancels all orders and disables trading
     */
    async activateKillSwitch(): Promise<void> {
        console.warn('[TradeGate] KILL SWITCH ACTIVATED');

        this._guardrails.killSwitchActive = true;
        this._killSwitchActivatedAt = new Date();

        // Cancel all orders
        await this.cancelAllOrders();

        // Log
        console.log('[TradeGate] All orders cancelled, trading disabled');
    }

    /**
     * Deactivate kill switch
     * Only works after cooldown period
     */
    async deactivateKillSwitch(): Promise<boolean> {
        if (!this._killSwitchActivatedAt) {
            this._guardrails.killSwitchActive = false;
            return true;
        }

        const elapsed = (Date.now() - this._killSwitchActivatedAt.getTime()) / 60000;

        if (elapsed < this._guardrails.killSwitchCooldownMinutes) {
            console.warn(`[TradeGate] Kill switch cooldown: ${this._guardrails.killSwitchCooldownMinutes - elapsed} minutes remaining`);
            return false;
        }

        this._guardrails.killSwitchActive = false;
        this._killSwitchActivatedAt = null;
        console.log('[TradeGate] Kill switch deactivated');
        return true;
    }

    /**
     * Get open orders
     */
    async getOpenOrders(): Promise<Order[]> {
        return [...this.openOrders];
    }

    /**
     * Get current positions
     */
    async getPositions(): Promise<Position[]> {
        return [...this.positions];
    }

    /**
     * Get daily realized P&L
     */
    async getDailyPnL(): Promise<number> {
        return this.dailyRealizedPnL;
    }

    /**
     * Get trades today count
     */
    async getTradesToday(): Promise<number> {
        return this.tradesToday;
    }

    /**
     * Check guardrails for a trade intent
     */
    checkGuardrails(intent: TradeIntent): GuardrailCheckResult {
        const violations: string[] = [];
        const warnings: string[] = [];

        // Check loss limits
        if (Math.abs(this.dailyRealizedPnL) >= this._guardrails.maxDailyRealizedLoss) {
            violations.push(`Daily loss limit reached ($${this._guardrails.maxDailyRealizedLoss})`);
        }

        // Check trade limits
        if (this.tradesToday >= this._guardrails.maxTradesPerDay) {
            violations.push(`Max trades per day (${this._guardrails.maxTradesPerDay})`);
        }

        if (this.tradesThisHour >= this._guardrails.maxTradesPerHour) {
            violations.push(`Max trades per hour (${this._guardrails.maxTradesPerHour})`);
        }

        // Check position limits
        if (this.positions.length >= this._guardrails.maxOpenPositions) {
            violations.push(`Max open positions (${this._guardrails.maxOpenPositions})`);
        }

        // Check risk per trade
        if (intent.maxRiskDollars > this._guardrails.maxRiskPerTrade) {
            violations.push(`Risk per trade exceeds $${this._guardrails.maxRiskPerTrade}`);
        }

        // Check blocked symbols
        if (this._guardrails.blockedSymbols?.includes(intent.symbol)) {
            violations.push(`Symbol blocked: ${intent.symbol}`);
        }

        // Check allowed symbols (if whitelist mode)
        if (this._guardrails.allowedSymbols &&
            !this._guardrails.allowedSymbols.includes(intent.symbol)) {
            violations.push(`Symbol not in allowed list: ${intent.symbol}`);
        }

        // Warnings
        if (this.tradesToday >= this._guardrails.maxTradesPerDay - 2) {
            warnings.push('Approaching daily trade limit');
        }

        return {
            passed: violations.length === 0,
            violations,
            warnings,
        };
    }

    /**
     * Update guardrail configuration
     */
    updateGuardrails(config: Partial<GuardrailConfig>): void {
        this._guardrails = { ...this._guardrails, ...config };
        console.log('[TradeGate] Guardrails updated');
    }

    /**
     * Reset daily counters (call at market open)
     */
    resetDailyCounters(): void {
        this.dailyRealizedPnL = 0;
        this.tradesToday = 0;
        this.tradesThisHour = 0;
        console.log('[TradeGate] Daily counters reset');
    }
}

// Singleton instance
let tradeGateInstance: TradeGate | null = null;

/**
 * Get the TradeGate singleton
 */
export function getTradeGate(): TradeGate {
    if (!tradeGateInstance) {
        tradeGateInstance = new TradeGate();
    }
    return tradeGateInstance;
}
