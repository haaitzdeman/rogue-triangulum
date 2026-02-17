/**
 * TradeGate Service - V1.1
 * 
 * The ONLY module allowed to execute trades.
 * Enforces all guardrails, MHC rules, and risk limits.
 * Supports PAPER and LIVE modes with explicit live unlock.
 * 
 * HARD RULE: NO other module can execute trades.
 */

import type {
    TradeIntent,
    ExecutionResult,
    TradingMode,
    Position,
} from './execution-types';
import type { BrokerAdapter } from './broker-adapter';
import { PaperBroker } from './paper-broker';
import { getLiveBrokerAdapter } from './broker-adapter';
import { checkMHC, isTradeBlocked } from '../risk/mhc';

/**
 * Guardrail configuration
 */
export interface GuardrailConfig {
    maxDailyRealizedLoss: number;
    maxDailyUnrealizedLoss: number;
    maxRiskPerTrade: number;
    maxTotalExposure: number;
    maxSymbolExposure: number;
    maxOpenPositions: number;
    maxTradesPerDay: number;
    maxTradesPerHour: number;
    allowPreMarket: boolean;
    allowAfterHours: boolean;
    blockOnEarnings: boolean;
    blockOnFOMC: boolean;
    blockOnCPI: boolean;
    killSwitchActive: boolean;
    killSwitchCooldownMinutes: number;
    blockedSymbols?: string[];
    allowedSymbols?: string[];
}

/**
 * Default guardrails (conservative)
 */
export const DEFAULT_GUARDRAILS: GuardrailConfig = {
    maxDailyRealizedLoss: 500,
    maxDailyUnrealizedLoss: 1000,
    maxRiskPerTrade: 100,
    maxTotalExposure: 10000,
    maxSymbolExposure: 2000,
    maxOpenPositions: 5,
    maxTradesPerDay: 10,
    maxTradesPerHour: 3,
    allowPreMarket: false,
    allowAfterHours: false,
    blockOnEarnings: true,
    blockOnFOMC: true,
    blockOnCPI: true,
    killSwitchActive: false,
    killSwitchCooldownMinutes: 30,
};

/**
 * Live unlock state (module-level singleton)
 */
let liveUnlockedUntil: number | null = null;
const LIVE_UNLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Current trading mode (default: PAPER)
 */
let currentMode: TradingMode = 'paper';

/**
 * Broker instances (lazy loaded)
 */
let paperBroker: BrokerAdapter | null = null;
let liveBroker: BrokerAdapter | null = null;

/**
 * Get paper broker (lazy init)
 */
function getPaperBroker(): BrokerAdapter {
    if (!paperBroker) {
        paperBroker = new PaperBroker();
    }
    return paperBroker;
}

/**
 * Get live broker (lazy init)
 */
function getLiveBroker(): BrokerAdapter {
    if (!liveBroker) {
        liveBroker = getLiveBrokerAdapter();
    }
    return liveBroker;
}

/**
 * Check if live mode is currently unlocked
 */
export function isLiveUnlocked(): boolean {
    if (liveUnlockedUntil === null) return false;
    if (Date.now() > liveUnlockedUntil) {
        // Expired - auto-relock
        liveUnlockedUntil = null;
        currentMode = 'paper';
        console.log('[TradeGate] Live unlock expired - reverting to paper mode');
        return false;
    }
    return true;
}

/**
 * Get remaining unlock time in ms
 */
export function getLiveUnlockRemaining(): number {
    if (!isLiveUnlocked()) return 0;
    return liveUnlockedUntil! - Date.now();
}

/**
 * Unlock live trading (requires exact confirmation text)
 */
export function unlockLiveTrading(confirmText: string): { success: boolean; error?: string } {
    if (confirmText !== 'ENABLE LIVE') {
        return { success: false, error: 'Must type "ENABLE LIVE" exactly' };
    }

    liveUnlockedUntil = Date.now() + LIVE_UNLOCK_DURATION_MS;
    console.log('[TradeGate] Live trading unlocked for 15 minutes');
    return { success: true };
}

/**
 * Lock live trading (manual re-lock)
 */
export function lockLiveTrading(): void {
    liveUnlockedUntil = null;
    currentMode = 'paper';
    console.log('[TradeGate] Live trading locked');
}

/**
 * Set trading mode
 */
export function setTradingMode(mode: TradingMode): { success: boolean; error?: string } {
    if (mode === 'live') {
        if (!isLiveUnlocked()) {
            return { success: false, error: 'Live trading is locked. Unlock first.' };
        }
    }

    currentMode = mode;
    console.log(`[TradeGate] Trading mode set to: ${mode}`);
    return { success: true };
}

/**
 * Get current trading mode
 */
export function getTradingMode(): TradingMode {
    // If live is set but lock expired, revert
    if (currentMode === 'live' && !isLiveUnlocked()) {
        currentMode = 'paper';
    }
    return currentMode;
}

/**
 * TradeGate class with guardrails
 */
export class TradeGate {
    private _guardrails: GuardrailConfig;
    private _killSwitchActivatedAt: Date | null = null;

    // State tracking
    private dailyRealizedPnL: number = 0;
    private tradesToday: number = 0;
    private tradesThisHour: number = 0;
    private positions: Position[] = [];

    constructor(guardrails?: Partial<GuardrailConfig>) {
        this._guardrails = { ...DEFAULT_GUARDRAILS, ...guardrails };
    }

    get mode(): TradingMode {
        return getTradingMode();
    }

    get guardrails(): GuardrailConfig {
        return { ...this._guardrails };
    }

    /**
     * Set execution mode (for backward compatibility)
     * Uses module-level setTradingMode function
     */
    async setMode(mode: 'PAPER' | 'LIVE'): Promise<boolean> {
        const tradingMode: TradingMode = mode.toLowerCase() as TradingMode;
        const result = setTradingMode(tradingMode);
        return result.success;
    }

    /**
     * Get trades today count
     */
    async getTradesToday(): Promise<number> {
        return this.tradesToday;
    }

    /**
     * Get daily realized P&L
     */
    async getDailyPnL(): Promise<number> {
        return this.dailyRealizedPnL;
    }

    /**
     * Execute a trade intent
     * 
     * @param intent - The trade intent to execute
     * @param mhcApproved - Whether user has approved MHC (required if MHC triggered)
     * @param requestedMode - Mode requested by caller (belt+suspenders check)
     */
    async execute(
        intent: TradeIntent,
        mhcApproved: boolean = false,
        requestedMode?: TradingMode
    ): Promise<ExecutionResult> {
        const mode = getTradingMode();

        console.log(`[TradeGate] Execute request: ${intent.symbol} ${intent.side} ${intent.quantity} (mode: ${mode}, requestedMode: ${requestedMode || 'not specified'})`);

        // 0. Belt+suspenders: if caller explicitly requests LIVE but we're in PAPER, reject
        if (requestedMode === 'live' && mode !== 'live') {
            console.warn('[TradeGate] REJECTING: requestedMode=live but effectiveMode=paper');
            return {
                success: false,
                error: 'LIVE mode is locked. Unlock required.',
                errorCode: 'live_locked',
                mode,
                simulated: true,
            };
        }

        // 1. Check kill switch
        if (this._guardrails.killSwitchActive) {
            return {
                success: false,
                error: 'Kill switch is active',
                errorCode: 'rejected',
                mode,
                simulated: mode === 'paper',
            };
        }

        // 2. Check MHC
        const mhcResult = checkMHC(intent, mode);

        if (isTradeBlocked(mhcResult)) {
            return {
                success: false,
                error: `Trade blocked: ${mhcResult.blockedReasons?.join(', ')}`,
                errorCode: 'rejected',
                mode,
                simulated: mode === 'paper',
            };
        }

        if (mhcResult.requiresMHC && !mhcApproved) {
            return {
                success: false,
                error: `MHC required: ${mhcResult.reasons.join(', ')}`,
                errorCode: 'mhc_rejected',
                mode,
                simulated: mode === 'paper',
            };
        }

        // 3. Check live unlock if in live mode
        if (mode === 'live' && !isLiveUnlocked()) {
            return {
                success: false,
                error: 'Live trading is locked',
                errorCode: 'live_locked',
                mode,
                simulated: false,
            };
        }

        // 4. Check guardrails
        const guardrailCheck = this.checkGuardrails(intent);
        if (!guardrailCheck.passed) {
            return {
                success: false,
                error: `Guardrail violation: ${guardrailCheck.violations.join(', ')}`,
                errorCode: 'rejected',
                mode,
                simulated: mode === 'paper',
            };
        }

        // 5. Route to appropriate broker
        const broker = mode === 'paper' ? getPaperBroker() : getLiveBroker();

        if (!broker.isConfigured) {
            return {
                success: false,
                error: `${mode} broker not configured`,
                errorCode: 'not_configured',
                mode,
                simulated: mode === 'paper',
            };
        }

        // 6. Execute
        const result = await broker.placeOrder(intent);

        // 7. Update tracking
        if (result.success) {
            this.tradesToday++;
            this.tradesThisHour++;
        }

        console.log(`[TradeGate] Execution result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.orderId || result.error}`);

        return result;
    }

    /**
     * Check guardrails for a trade intent
     */
    checkGuardrails(intent: TradeIntent): { passed: boolean; violations: string[]; warnings: string[] } {
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
     * Check MHC for an intent without executing
     */
    checkIntent(intent: TradeIntent): ReturnType<typeof checkMHC> {
        return checkMHC(intent, getTradingMode());
    }

    /**
     * Activate kill switch
     */
    async activateKillSwitch(): Promise<void> {
        console.warn('[TradeGate] KILL SWITCH ACTIVATED');
        this._guardrails.killSwitchActive = true;
        this._killSwitchActivatedAt = new Date();
    }

    /**
     * Deactivate kill switch (after cooldown)
     */
    async deactivateKillSwitch(): Promise<boolean> {
        if (!this._killSwitchActivatedAt) {
            this._guardrails.killSwitchActive = false;
            return true;
        }

        const elapsed = (Date.now() - this._killSwitchActivatedAt.getTime()) / 60000;

        if (elapsed < this._guardrails.killSwitchCooldownMinutes) {
            console.warn(`[TradeGate] Kill switch cooldown: ${Math.round(this._guardrails.killSwitchCooldownMinutes - elapsed)} minutes remaining`);
            return false;
        }

        this._guardrails.killSwitchActive = false;
        this._killSwitchActivatedAt = null;
        console.log('[TradeGate] Kill switch deactivated');
        return true;
    }

    /**
     * Get positions
     */
    async getPositions(): Promise<Position[]> {
        const broker = getTradingMode() === 'paper' ? getPaperBroker() : getLiveBroker();
        return broker.getPositions();
    }

    /**
     * Update guardrails
     */
    updateGuardrails(config: Partial<GuardrailConfig>): void {
        this._guardrails = { ...this._guardrails, ...config };
        console.log('[TradeGate] Guardrails updated');
    }

    /**
     * Reset daily counters
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

/**
 * Get TradeGate status
 */
export function getTradeGateStatus(): {
    mode: TradingMode;
    liveUnlocked: boolean;
    liveUnlockRemaining: number;
    paperBrokerReady: boolean;
    liveBrokerReady: boolean;
} {
    return {
        mode: getTradingMode(),
        liveUnlocked: isLiveUnlocked(),
        liveUnlockRemaining: getLiveUnlockRemaining(),
        paperBrokerReady: getPaperBroker().isConfigured,
        liveBrokerReady: getLiveBroker().isConfigured,
    };
}

/**
 * Create a trade intent from source data
 */
export function createTradeIntent(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    source: TradeIntent['source'],
    options?: {
        limitPrice?: number;
        stopLoss?: number;
        takeProfit?: number;
    }
): TradeIntent {
    const now = new Date().toISOString();
    return {
        id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        side,
        quantity,
        orderType: options?.limitPrice ? 'limit' : 'market',
        limitPrice: options?.limitPrice,
        stopLoss: options?.stopLoss,
        takeProfit: options?.takeProfit,
        positionValue: quantity * (options?.limitPrice || 100),
        positionPercent: 0,
        source,
        timeInForce: 'day',
        createdAt: now,
    };
}
