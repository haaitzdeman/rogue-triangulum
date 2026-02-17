/**
 * Signal Utils
 * 
 * Utilities for generating deterministic signal IDs and computing trade outcomes.
 * Used by the premarket journal system.
 */

import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export interface SignalSnapshot {
    symbol: string;
    gapPct: number;
    direction: 'UP' | 'DOWN';
    playType: 'CONTINUATION' | 'FADE' | 'AVOID';
    confidence: 'HIGH' | 'LOW';
    lowConfidence: boolean;
    because: string;
    analogStats: Record<string, unknown>;
    keyLevels: Record<string, unknown>;
    invalidation: string;
    riskNote: string;
    configUsed: Record<string, unknown>;
    resolved?: {
        mode: string;
        effectiveDate: string;
    };
}

export interface TradeDetails {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice?: number;
    size: number;  // Number of shares or position size in $
    entryTime?: string;  // ISO timestamp
    exitTime?: string;   // ISO timestamp
}

export interface TradeOutcome {
    pnlDollars: number;
    pnlPercent: number;
    rMultiple: number;
    result: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING';
    notes?: string;
}

// =============================================================================
// Signal ID Generation
// =============================================================================

/**
 * Generate a deterministic signal ID from signal components.
 * Hash of: effectiveDate + symbol + gapPct + configUsed
 * 
 * This allows detecting duplicate signals across scans.
 */
export function generateSignalId(
    effectiveDate: string,
    symbol: string,
    gapPct: number,
    configUsed: Record<string, unknown>
): string {
    // Normalize inputs for consistent hashing
    const normalizedGap = gapPct.toFixed(4);
    const normalizedConfig = JSON.stringify(configUsed, Object.keys(configUsed).sort());

    const input = `${effectiveDate}|${symbol.toUpperCase()}|${normalizedGap}|${normalizedConfig}`;

    const hash = crypto.createHash('sha256').update(input).digest('hex');

    // Return first 16 chars for readability
    return hash.slice(0, 16);
}

// =============================================================================
// PnL Calculations
// =============================================================================

/**
 * Calculate trade outcome from entry/exit data.
 * 
 * @param trade - Trade details with entry/exit prices
 * @param riskPerShare - Risk per share for R-multiple calculation (from keyLevels.stopLoss)
 * @returns Calculated outcome or undefined if insufficient data
 */
export function calculateOutcome(
    trade: TradeDetails,
    riskPerShare?: number
): TradeOutcome | null {
    // Need exit price to calculate outcome
    if (trade.exitPrice === undefined || trade.exitPrice === null) {
        return {
            pnlDollars: 0,
            pnlPercent: 0,
            rMultiple: 0,
            result: 'PENDING',
        };
    }

    // Calculate raw PnL per share
    const pnlPerShare = trade.direction === 'LONG'
        ? trade.exitPrice - trade.entryPrice
        : trade.entryPrice - trade.exitPrice;

    // Calculate dollar PnL
    const pnlDollars = Number((pnlPerShare * trade.size).toFixed(2));

    // Calculate percent PnL
    const pnlPercent = Number(((pnlPerShare / trade.entryPrice) * 100).toFixed(4));

    // Calculate R-multiple if risk is provided
    let rMultiple = 0;
    if (riskPerShare && riskPerShare > 0) {
        rMultiple = Number((pnlPerShare / riskPerShare).toFixed(2));
    }

    // Determine result
    let result: TradeOutcome['result'] = 'BREAKEVEN';
    if (pnlDollars > 0.01) result = 'WIN';
    else if (pnlDollars < -0.01) result = 'LOSS';

    return {
        pnlDollars,
        pnlPercent,
        rMultiple,
        result,
    };
}

/**
 * Extract risk per share from key levels.
 * Uses stopLoss to calculate initial risk.
 */
export function extractRiskPerShare(
    keyLevels: Record<string, unknown>,
    entryPrice: number,
    direction: 'LONG' | 'SHORT'
): number | undefined {
    const stopLoss = keyLevels.stopLoss as number | undefined;
    if (stopLoss === undefined) return undefined;

    if (direction === 'LONG') {
        return Math.abs(entryPrice - stopLoss);
    } else {
        return Math.abs(stopLoss - entryPrice);
    }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Allowed fields for outcome PATCH updates.
 * Prevents modification of signal data.
 */
export const ALLOWED_OUTCOME_FIELDS = [
    'trade_direction',
    'entry_price',
    'exit_price',
    'size',
    'entry_time',
    'exit_time',
    'outcome',
    'user_note',
    'status',
] as const;

/**
 * Validate that only allowed fields are being updated.
 */
export function validateOutcomeUpdate(
    updates: Record<string, unknown>
): { valid: boolean; disallowedFields: string[] } {
    const disallowedFields: string[] = [];

    for (const key of Object.keys(updates)) {
        if (!ALLOWED_OUTCOME_FIELDS.includes(key as typeof ALLOWED_OUTCOME_FIELDS[number])) {
            disallowedFields.push(key);
        }
    }

    return {
        valid: disallowedFields.length === 0,
        disallowedFields,
    };
}
