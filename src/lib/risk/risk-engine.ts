/**
 * Risk Engine — Pure Logic
 *
 * System-level risk enforcement. All functions are pure — no DB access.
 *
 * Tracks daily realized + unrealized PnL, enforces daily max loss,
 * per-trade max risk, duplicate position blocking, and max open positions.
 */

// =============================================================================
// Types
// =============================================================================

/** Minimal journal entry shape needed for risk calculations */
export interface RiskEntry {
    id: string;
    symbol: string;
    status: string;               // PLANNED, ENTERED, OPEN, EXITED, CLOSED
    entry_price?: number | null;
    exit_price?: number | null;
    size?: number | null;
    total_qty?: number | null;
    realized_pnl_dollars?: number | null;
    unrealized_pnl_dollars?: number | null;
    trade_direction?: string;     // LONG or SHORT
    current_price?: number | null; // live price for unrealized calc
    desk?: string;                // PREMARKET | OPTIONS (for scope filtering)
    is_draft?: boolean;           // drafts are not counted toward open positions
    risk_dollars?: number | null; // computed normalized risk in dollars
}

export interface DailyRiskState {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    openPositions: number;
    dailyLossLimitBreached: boolean;
    dailyProfitTargetHit: boolean;
}

export interface RiskConfig {
    dailyMaxLoss: number;
    dailyProfitTarget: number;
    perTradeMaxRisk: number;
    maxOpenPositions: number;
}

export interface CanOpenResult {
    allowed: boolean;
    reason?: string;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Compute daily risk state from today's journal entries.
 *
 * When ledgerRealizedPnl is provided (from immutable trade_ledger),
 * it takes precedence over mutable journal-based realized PnL.
 * Unrealized PnL is always calculated from journal entries.
 */
export function computeDailyRiskState(
    entries: RiskEntry[],
    config: RiskConfig,
    options?: { ledgerRealizedPnl?: number },
): DailyRiskState {
    const useLedger = options?.ledgerRealizedPnl != null;
    let realizedPnl = useLedger ? options!.ledgerRealizedPnl! : 0;
    let unrealizedPnl = 0;
    let openPositions = 0;

    for (const entry of entries) {
        const status = entry.status?.toUpperCase();

        // Realized: from EXITED/CLOSED entries (skip if ledger provides it)
        if (!useLedger && (status === 'EXITED' || status === 'CLOSED')) {
            if (entry.realized_pnl_dollars != null) {
                realizedPnl += entry.realized_pnl_dollars;
            } else if (
                entry.entry_price != null &&
                entry.exit_price != null &&
                (entry.total_qty ?? entry.size ?? 0) > 0
            ) {
                const qty = entry.total_qty ?? entry.size ?? 0;
                const direction = (entry.trade_direction || 'LONG').toUpperCase();
                const pnl = direction === 'SHORT'
                    ? (entry.entry_price - entry.exit_price) * qty
                    : (entry.exit_price - entry.entry_price) * qty;
                realizedPnl += pnl;
            }
        }

        // Unrealized: from ENTERED/OPEN entries with current_price
        if (status === 'ENTERED' || status === 'OPEN') {
            // Drafts do NOT count toward open positions
            if (!entry.is_draft) {
                openPositions++;
            }

            if (entry.unrealized_pnl_dollars != null) {
                unrealizedPnl += entry.unrealized_pnl_dollars;
            } else if (
                entry.entry_price != null &&
                entry.current_price != null &&
                (entry.total_qty ?? entry.size ?? 0) > 0
            ) {
                const qty = entry.total_qty ?? entry.size ?? 0;
                const direction = (entry.trade_direction || 'LONG').toUpperCase();
                const pnl = direction === 'SHORT'
                    ? (entry.entry_price - entry.current_price) * qty
                    : (entry.current_price - entry.entry_price) * qty;
                unrealizedPnl += pnl;
            }
        }

        // PLANNED counts toward open slots (unless draft)
        if (status === 'PLANNED' && !entry.is_draft) {
            openPositions++;
        }
    }

    realizedPnl = round2(realizedPnl);
    unrealizedPnl = round2(unrealizedPnl);
    const totalPnl = round2(realizedPnl + unrealizedPnl);

    return {
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        openPositions,
        dailyLossLimitBreached: totalPnl <= -Math.abs(config.dailyMaxLoss),
        dailyProfitTargetHit: totalPnl >= config.dailyProfitTarget,
    };
}

/**
 * Check whether a new position can be opened.
 */
export function canOpenNewPosition(params: {
    config: RiskConfig;
    currentDailyPnl: number;
    openPositions: number;
    proposedRisk: number;
    dailyLossLimitBreached: boolean;
}): CanOpenResult {
    const { config, currentDailyPnl, openPositions, proposedRisk, dailyLossLimitBreached } = params;

    // 1) Daily loss limit breached
    if (dailyLossLimitBreached) {
        return {
            allowed: false,
            reason: `Daily loss limit breached (PnL: $${currentDailyPnl}, limit: -$${config.dailyMaxLoss})`,
        };
    }

    // 2) Max open positions
    if (openPositions >= config.maxOpenPositions) {
        return {
            allowed: false,
            reason: `Max open positions reached (${openPositions}/${config.maxOpenPositions})`,
        };
    }

    // 3) Per-trade risk exceeded
    if (proposedRisk > config.perTradeMaxRisk) {
        return {
            allowed: false,
            reason: `Per-trade risk $${proposedRisk} exceeds max $${config.perTradeMaxRisk}`,
        };
    }

    // 4) Would this trade push us past daily limit?
    const worstCase = currentDailyPnl - proposedRisk;
    if (worstCase <= -Math.abs(config.dailyMaxLoss)) {
        return {
            allowed: false,
            reason: `Trade would push daily PnL to $${round2(worstCase)}, past limit -$${config.dailyMaxLoss}`,
        };
    }

    return { allowed: true };
}

export type DuplicateScope = 'GLOBAL' | 'DESK_ONLY';

/**
 * Check if a position already exists for this symbol in open entries.
 *
 * scope:
 *   'GLOBAL'    — blocks across all desks (default)
 *   'DESK_ONLY' — only blocks within entries sharing the same desk tag
 *
 * deskFilter: required when scope='DESK_ONLY', the desk to match against
 */
export function isDuplicateLivePosition(
    symbol: string,
    openEntries: RiskEntry[],
    scope: DuplicateScope = 'GLOBAL',
    deskFilter?: string,
): boolean {
    const target = symbol.toUpperCase();
    return openEntries.some(e => {
        const status = e.status?.toUpperCase();
        const isLive = status === 'ENTERED' || status === 'OPEN' || status === 'PLANNED';
        if (!isLive) return false;
        if (e.symbol.toUpperCase() !== target) return false;

        if (scope === 'DESK_ONLY' && deskFilter) {
            return e.desk?.toUpperCase() === deskFilter.toUpperCase();
        }

        return true; // GLOBAL: any desk matches
    });
}

// =============================================================================
// Helpers
// =============================================================================

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
