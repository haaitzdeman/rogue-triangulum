/**
 * Reconcile Engine v2
 *
 * Pure logic module that matches broker fills to journal entries and computes
 * trade outcomes. No DB calls — returns update instructions for the caller.
 *
 * RULES:
 * - Never overwrites entries with manual_override=true (returns BLOCKED status)
 * - Records entry_fill_id + exit_fill_id for audit
 * - Appends system_update_reason with batchId
 * - Computes PnL, R-multiple, WIN/LOSS/BREAKEVEN
 * - Returns reconcileStatus + matchExplanation for transparency
 * - Supports scale-in (multiple entry fills → VWAP) and partial exits
 */

import type { BrokerFill } from './types';
import type { OptionsFillGroup } from './options-fill-grouper';

// =============================================================================
// Types
// =============================================================================

export type ReconcileStatus =
    | 'MATCHED'                  // Clean 1:1 entry+exit pair
    | 'PARTIAL'                  // Some exits but position still open
    | 'AMBIGUOUS'                // Multiple possible matches, can't decide
    | 'AMBIGUOUS_REVERSAL'       // Exit overshoots entry qty — possible flip
    | 'BLOCKED_MANUAL_OVERRIDE'  // Entry has manual_override=true
    | 'NONE';                    // No matching fills found

/** Minimal journal entry shape needed for reconciliation */
export interface ReconcilableEntry {
    id: string;
    symbol: string;
    effective_date?: string;    // YYYY-MM-DD (premarket)
    scanned_at?: string;        // ISO (options)
    status: string;             // OPEN, ENTERED, EXITED, etc.
    trade_direction?: string;   // LONG or SHORT
    entry_price?: number | null;
    exit_price?: number | null;
    size?: number | null;
    stop_loss?: number | null;
    invalidation?: string | null;
    key_levels?: Record<string, unknown> | null;
    manual_override?: boolean;
    entry_fill_id?: string | null;
    exit_fill_id?: string | null;
    // Scale fields
    avg_entry_price?: number | null;
    total_qty?: number | null;
    exited_qty?: number | null;
    realized_pnl_dollars?: number | null;
    // Options-specific
    selected_contract?: {
        symbol?: string;
        strike?: number;
        expiration?: string;
        type?: string;
    } | null;
}

/** A fill candidate that was considered but rejected */
export interface AmbiguityCandidate {
    fillId: string;
    symbol: string;
    side: string;
    price: number;
    filledAt: string;
    whyRejected: string[];
}

/** Update instruction produced by reconciliation */
export interface ReconcileUpdate {
    entryId: string;
    updates: Record<string, unknown>;
    reason: string;
    reconcileStatus: ReconcileStatus;
    matchExplanation: string[];
    ambiguityCandidates: AmbiguityCandidate[];
}

/** PnL computation result */
export interface OutcomeResult {
    exitPrice: number;
    exitTime: string;
    pnlDollars: number;
    pnlPercent: number;
    rMultiple: number | null;
    result: 'WIN' | 'LOSS' | 'BREAKEVEN';
}

/** Result of fill matching with transparency */
export interface MatchResult {
    entryFills: BrokerFill[];
    exitFills: BrokerFill[];
    explanation: string[];
    ambiguityCandidates: AmbiguityCandidate[];
    status: 'MATCHED' | 'PARTIAL' | 'AMBIGUOUS' | 'NONE';
}

// =============================================================================
// Fill Matching with Transparency
// =============================================================================

/**
 * Match fills to a journal entry by symbol, date window, and side.
 * Returns detailed match result with explanation and ambiguity info.
 */
export function matchFillsWithExplanation(
    entry: ReconcilableEntry,
    fills: BrokerFill[],
    options?: { dateWindowDays?: number },
): MatchResult {
    const explanation: string[] = [];
    const ambiguityCandidates: AmbiguityCandidate[] = [];
    const dateWindow = options?.dateWindowDays ?? 1;

    const entryDate = entry.effective_date || (entry.scanned_at ? entry.scanned_at.slice(0, 10) : null);
    if (!entryDate) {
        explanation.push('No effective_date or scanned_at on entry');
        return { entryFills: [], exitFills: [], explanation, ambiguityCandidates, status: 'NONE' };
    }

    // Step 1: Filter fills by symbol
    const symbolMatched: BrokerFill[] = [];
    const symbolRejected: BrokerFill[] = [];

    for (const f of fills) {
        if (matchSymbol(entry, f)) {
            symbolMatched.push(f);
        } else {
            symbolRejected.push(f);
        }
    }

    if (symbolMatched.length === 0) {
        explanation.push(`No fills matched symbol "${entry.symbol}"`);
        return { entryFills: [], exitFills: [], explanation, ambiguityCandidates, status: 'NONE' };
    }
    explanation.push(`${symbolMatched.length} fill(s) matched symbol "${entry.symbol}"`);

    // Step 2: Filter by date window
    const dateMatched: BrokerFill[] = [];
    for (const f of symbolMatched) {
        const fillDate = f.filledAt.slice(0, 10);
        const daysDiff = Math.abs(dateDiffDays(entryDate, fillDate));
        if (daysDiff <= dateWindow) {
            dateMatched.push(f);
        } else {
            // Track as rejected candidate
            ambiguityCandidates.push({
                fillId: f.tradeId,
                symbol: f.symbol,
                side: f.side,
                price: f.price,
                filledAt: f.filledAt,
                whyRejected: [`Outside date window: ${daysDiff} days from ${entryDate} (max ${dateWindow})`],
            });
        }
    }

    if (dateMatched.length === 0) {
        explanation.push(`All symbol-matched fills were outside ±${dateWindow} day window from ${entryDate}`);
        return { entryFills: [], exitFills: [], explanation, ambiguityCandidates: ambiguityCandidates.slice(0, 3), status: 'NONE' };
    }
    explanation.push(`${dateMatched.length} fill(s) within ±${dateWindow} day window of ${entryDate}`);

    // Step 3: Separate entry/exit fills by direction
    const direction = entry.trade_direction || 'LONG';
    const entrySide = direction === 'LONG' ? 'buy' : 'sell';
    const exitSide = direction === 'LONG' ? 'sell' : 'buy';

    const entryFills = dateMatched
        .filter(f => f.side === entrySide)
        .sort((a, b) => new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime());

    const exitFills = dateMatched
        .filter(f => f.side === exitSide)
        .sort((a, b) => new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime());

    explanation.push(`Direction=${direction}: ${entryFills.length} entry fill(s) (${entrySide}), ${exitFills.length} exit fill(s) (${exitSide})`);

    // Step 4: Determine status
    if (entryFills.length === 0) {
        explanation.push('No entry-side fills found');
        // Track exit fills as ambiguity candidates
        for (const f of exitFills.slice(0, 3)) {
            ambiguityCandidates.push({
                fillId: f.tradeId,
                symbol: f.symbol,
                side: f.side,
                price: f.price,
                filledAt: f.filledAt,
                whyRejected: [`Wrong side for entry: expected ${entrySide}, got ${f.side}`],
            });
        }
        return { entryFills: [], exitFills: [], explanation, ambiguityCandidates: ambiguityCandidates.slice(0, 3), status: 'NONE' };
    }

    // Check for ambiguity: too many unrelated fills
    const totalFills = entryFills.length + exitFills.length;
    if (totalFills > 10) {
        explanation.push(`Ambiguous: ${totalFills} total fills (>10 threshold)`);
        return {
            entryFills, exitFills, explanation,
            ambiguityCandidates: dateMatched.slice(0, 3).map(f => ({
                fillId: f.tradeId, symbol: f.symbol, side: f.side,
                price: f.price, filledAt: f.filledAt,
                whyRejected: ['Part of ambiguous batch with >10 fills'],
            })),
            status: 'AMBIGUOUS',
        };
    }

    // Compute total entry qty vs exit qty
    const totalEntryQty = entryFills.reduce((sum, f) => sum + f.qty, 0);
    const totalExitQty = exitFills.reduce((sum, f) => sum + f.qty, 0);

    let status: 'MATCHED' | 'PARTIAL' | 'NONE';
    if (exitFills.length === 0) {
        status = 'NONE';
        explanation.push('No exit-side fills found — position fully open');
    } else if (totalExitQty >= totalEntryQty) {
        status = 'MATCHED';
        explanation.push(`Fully matched: entry qty=${totalEntryQty}, exit qty=${totalExitQty}`);
    } else {
        status = 'PARTIAL';
        explanation.push(`Partial exit: entry qty=${totalEntryQty}, exited qty=${totalExitQty}, remaining=${totalEntryQty - totalExitQty}`);
    }

    return { entryFills, exitFills, explanation, ambiguityCandidates: ambiguityCandidates.slice(0, 3), status };
}

/**
 * Legacy compatibility: match fills returning single pair.
 */
export function matchFillsToEntry(
    entry: ReconcilableEntry,
    fills: BrokerFill[],
    options?: { dateWindowDays?: number },
): { entryFill: BrokerFill; exitFill: BrokerFill } | null {
    const result = matchFillsWithExplanation(entry, fills, options);
    if (result.entryFills.length === 0 || result.exitFills.length === 0) return null;
    return { entryFill: result.entryFills[0], exitFill: result.exitFills[0] };
}

/**
 * Match symbol: for stocks, direct match. For options, match OCC symbol
 * or fallback to underlying symbol.
 */
function matchSymbol(entry: ReconcilableEntry, fill: BrokerFill): boolean {
    const entrySymbol = entry.symbol.toUpperCase();
    const fillSymbol = fill.symbol.toUpperCase();

    if (entrySymbol === fillSymbol) return true;

    if (fill.assetClass === 'option' && fill.underlyingSymbol) {
        if (entrySymbol === fill.underlyingSymbol.toUpperCase()) return true;
    }

    if (entry.selected_contract?.symbol) {
        const contractSymbol = entry.selected_contract.symbol.toUpperCase();
        if (contractSymbol === fillSymbol) return true;
    }

    return false;
}

// =============================================================================
// Scale In/Out Computation
// =============================================================================

/**
 * Compute VWAP (volume-weighted average price) for multiple fills.
 */
export function computeVWAP(fills: BrokerFill[]): { avgPrice: number; totalQty: number } {
    if (fills.length === 0) return { avgPrice: 0, totalQty: 0 };

    let totalCost = 0;
    let totalQty = 0;
    for (const f of fills) {
        totalCost += f.price * f.qty;
        totalQty += f.qty;
    }

    return {
        avgPrice: totalQty > 0 ? roundTo(totalCost / totalQty, 4) : 0,
        totalQty,
    };
}

/**
 * Compute realized PnL from partial or full exits against an avg entry price.
 */
export function computeRealizedPnL(
    avgEntryPrice: number,
    exitFills: BrokerFill[],
    direction: string,
): { realizedPnl: number; exitedQty: number; lastExitTime: string } {
    let realizedPnl = 0;
    let exitedQty = 0;
    let lastExitTime = '';

    for (const f of exitFills) {
        const priceDiff = direction === 'LONG'
            ? f.price - avgEntryPrice
            : avgEntryPrice - f.price;

        realizedPnl += priceDiff * f.qty;
        exitedQty += f.qty;

        if (f.filledAt > lastExitTime) {
            lastExitTime = f.filledAt;
        }
    }

    return {
        realizedPnl: roundTo(realizedPnl, 2),
        exitedQty,
        lastExitTime,
    };
}

// =============================================================================
// PnL Computation (single pair — legacy + simple cases)
// =============================================================================

/**
 * Compute trade outcome from entry + exit fills.
 * Pure function — no side effects.
 */
export function computeOutcome(
    entryFill: BrokerFill,
    exitFill: BrokerFill,
    params?: {
        direction?: string;
        stopLoss?: number | null;
        size?: number | null;
    },
): OutcomeResult {
    const direction = params?.direction || 'LONG';
    const qty = params?.size ?? entryFill.qty;

    const entryPrice = entryFill.price;
    const exitPrice = exitFill.price;

    const priceDiff = direction === 'LONG'
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;

    const pnlDollars = roundTo(priceDiff * qty, 2);
    const pnlPercent = entryPrice !== 0
        ? roundTo((priceDiff / entryPrice) * 100, 4)
        : 0;

    let rMultiple: number | null = null;
    if (params?.stopLoss != null && params.stopLoss > 0) {
        const riskPerShare = direction === 'LONG'
            ? entryPrice - params.stopLoss
            : params.stopLoss - entryPrice;

        if (riskPerShare > 0) {
            rMultiple = roundTo(priceDiff / riskPerShare, 2);
        }
    }

    const BREAKEVEN_THRESHOLD = 0.001;
    let result: 'WIN' | 'LOSS' | 'BREAKEVEN';
    if (Math.abs(pnlPercent) < BREAKEVEN_THRESHOLD) {
        result = 'BREAKEVEN';
    } else if (pnlDollars > 0) {
        result = 'WIN';
    } else {
        result = 'LOSS';
    }

    return {
        exitPrice,
        exitTime: exitFill.filledAt,
        pnlDollars,
        pnlPercent,
        rMultiple,
        result,
    };
}

// =============================================================================
// Reconciliation (v2 — transparency + scale)
// =============================================================================

/**
 * Reconcile premarket journal entries against broker fills.
 * Returns update instructions with full transparency.
 */
export function reconcileEntries(
    entries: ReconcilableEntry[],
    fills: BrokerFill[],
    batchId: string,
): ReconcileUpdate[] {
    const updates: ReconcileUpdate[] = [];

    for (const entry of entries) {
        // Skip if already fully exited
        if (entry.status === 'EXITED' || entry.status === 'CLOSED') continue;

        // BLOCKED_MANUAL_OVERRIDE
        if (entry.manual_override === true) {
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'BLOCKED_MANUAL_OVERRIDE',
                    match_explanation: ['Entry has manual_override=true — skipping auto-reconcile'],
                },
                reason: 'Blocked by manual_override',
                reconcileStatus: 'BLOCKED_MANUAL_OVERRIDE',
                matchExplanation: ['Entry has manual_override=true — skipping auto-reconcile'],
                ambiguityCandidates: [],
            });
            continue;
        }

        // Only reconcile entries that are ENTERED or OPEN
        if (entry.status !== 'ENTERED' && entry.status !== 'OPEN') continue;

        // Match fills with full explanation
        const match = matchFillsWithExplanation(entry, fills);

        // NONE — no fills found
        if (match.status === 'NONE') {
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'NONE',
                    match_explanation: match.explanation,
                },
                reason: 'No matching fills',
                reconcileStatus: 'NONE',
                matchExplanation: match.explanation,
                ambiguityCandidates: match.ambiguityCandidates,
            });
            continue;
        }

        // AMBIGUOUS — too many candidates
        if (match.status === 'AMBIGUOUS') {
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'AMBIGUOUS',
                    match_explanation: match.explanation,
                },
                reason: 'Ambiguous match — manual review needed',
                reconcileStatus: 'AMBIGUOUS',
                matchExplanation: match.explanation,
                ambiguityCandidates: match.ambiguityCandidates,
            });
            continue;
        }

        // Compute scale-in VWAP
        const { avgPrice: avgEntryPrice, totalQty } = computeVWAP(match.entryFills);
        const direction = entry.trade_direction || 'LONG';
        const stopLoss = extractStopLoss(entry);

        if (match.exitFills.length === 0) {
            // Entry fills found but no exits — just record entry data
            const entryFillIds = match.entryFills.map(f => `${f.broker}:${f.tradeId}`).join(',');
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'NONE',
                    match_explanation: match.explanation,
                    avg_entry_price: avgEntryPrice,
                    total_qty: totalQty,
                    entry_price: entry.entry_price ?? avgEntryPrice,
                    size: entry.size ?? totalQty,
                    entry_fill_id: entryFillIds,
                    system_update_reason: `auto-reconcile:${batchId}`,
                },
                reason: `Entry fills found (avg $${avgEntryPrice}, qty ${totalQty}) but no exits yet`,
                reconcileStatus: 'NONE',
                matchExplanation: match.explanation,
                ambiguityCandidates: [],
            });
            continue;
        }

        // === REVERSAL DETECTION ===
        // If exit qty overshoots total entry qty, it's a possible reversal
        const totalExitQty = match.exitFills.reduce((sum, f) => sum + f.qty, 0);
        if (totalExitQty > totalQty * 1.05) { // 5% tolerance for rounding
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'AMBIGUOUS_REVERSAL',
                    match_explanation: [
                        ...match.explanation,
                        `Reversal detected: exit qty ${totalExitQty} > entry qty ${totalQty}`,
                        'Possible same-day flip — manual split required',
                    ],
                    avg_entry_price: avgEntryPrice,
                    total_qty: totalQty,
                    entry_fill_id: match.entryFills.map(f => `${f.broker}:${f.tradeId}`).join(','),
                    system_update_reason: `auto-reconcile:${batchId}:reversal-blocked`,
                },
                reason: `Reversal detected: exit qty ${totalExitQty} > entry qty ${totalQty}`,
                reconcileStatus: 'AMBIGUOUS_REVERSAL',
                matchExplanation: [
                    ...match.explanation,
                    `Exit qty (${totalExitQty}) exceeds entry qty (${totalQty})`,
                ],
                ambiguityCandidates: match.ambiguityCandidates,
            });
            continue;
        }

        // Compute realized PnL from exits
        const { realizedPnl, exitedQty, lastExitTime } = computeRealizedPnL(
            avgEntryPrice, match.exitFills, direction,
        );

        const entryFillIds = match.entryFills.map(f => `${f.broker}:${f.tradeId}`).join(',');
        const exitFillIds = match.exitFills.map(f => `${f.broker}:${f.tradeId}`).join(',');

        // R-multiple based on avg entry
        let rMultiple: number | null = null;
        if (stopLoss != null && stopLoss > 0) {
            const riskPerShare = direction === 'LONG'
                ? avgEntryPrice - stopLoss
                : stopLoss - avgEntryPrice;
            if (riskPerShare > 0 && exitedQty > 0) {
                const rewardPerShare = realizedPnl / exitedQty;
                rMultiple = roundTo(rewardPerShare / riskPerShare, 2);
            }
        }

        // PnL percent
        const pnlPercent = avgEntryPrice > 0
            ? roundTo((realizedPnl / (avgEntryPrice * exitedQty)) * 100, 4)
            : 0;

        // Determine if fully exited
        const fullyExited = exitedQty >= totalQty;
        const reconcileStatus: ReconcileStatus = fullyExited ? 'MATCHED' : 'PARTIAL';

        // Result classification
        const BREAKEVEN_THRESHOLD = 0.001;
        let result: 'WIN' | 'LOSS' | 'BREAKEVEN';
        if (Math.abs(pnlPercent) < BREAKEVEN_THRESHOLD) {
            result = 'BREAKEVEN';
        } else if (realizedPnl > 0) {
            result = 'WIN';
        } else {
            result = 'LOSS';
        }

        const update: ReconcileUpdate = {
            entryId: entry.id,
            updates: {
                status: fullyExited ? 'EXITED' : entry.status,
                reconcile_status: reconcileStatus,
                match_explanation: match.explanation,
                avg_entry_price: avgEntryPrice,
                total_qty: totalQty,
                exited_qty: exitedQty,
                realized_pnl_dollars: realizedPnl,
                entry_price: entry.entry_price ?? avgEntryPrice,
                exit_price: fullyExited ? match.exitFills[match.exitFills.length - 1].price : undefined,
                exit_time: fullyExited ? lastExitTime : undefined,
                size: entry.size ?? totalQty,
                entry_fill_id: entryFillIds,
                exit_fill_id: exitFillIds,
                pnl_dollars: realizedPnl,
                pnl_percent: pnlPercent,
                r_multiple: rMultiple,
                result: fullyExited ? result : undefined,
                system_update_reason: `auto-reconcile:${batchId}`,
            },
            reason: fullyExited
                ? `Auto-reconciled: ${result} $${realizedPnl} (${pnlPercent}%)`
                : `Partial exit: $${realizedPnl} on ${exitedQty}/${totalQty} qty`,
            reconcileStatus,
            matchExplanation: match.explanation,
            ambiguityCandidates: match.ambiguityCandidates,
        };

        updates.push(update);
    }

    return updates;
}

// =============================================================================
// Options Reconciliation
// =============================================================================

/** Options journal entry shape for reconciliation */
export interface ReconcilableOptionsEntry {
    id: string;
    symbol: string;
    status: string;
    scanned_at?: string;
    selected_contract?: {
        symbol?: string;
        strike?: number;
        expiration?: string;
        type?: string;
    } | null;
    is_spread?: boolean;
    legs_json?: unknown[] | null;
    manual_override?: boolean;
    entry_fill_id?: string | null;
    exit_fill_id?: string | null;
    total_qty?: number | null;
    exited_qty?: number | null;
    net_debit_credit?: number | null;
}

/**
 * Reconcile options journal entries against grouped fills.
 * PnL is computed from cashflows (debit/credit × 100 × contracts).
 */
export function reconcileOptionsEntries(
    entries: ReconcilableOptionsEntry[],
    groups: OptionsFillGroup[],
    batchId: string,
): ReconcileUpdate[] {
    const updates: ReconcileUpdate[] = [];

    for (const entry of entries) {
        if (entry.status === 'EXITED' || entry.status === 'CLOSED') continue;

        if (entry.manual_override === true) {
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'BLOCKED_MANUAL_OVERRIDE',
                    match_explanation: ['Entry has manual_override=true — skipping auto-reconcile'],
                },
                reason: 'Blocked by manual_override',
                reconcileStatus: 'BLOCKED_MANUAL_OVERRIDE',
                matchExplanation: ['Entry has manual_override=true — skipping auto-reconcile'],
                ambiguityCandidates: [],
            });
            continue;
        }

        if (entry.status !== 'ENTERED' && entry.status !== 'OPEN' && entry.status !== 'PLANNED') continue;

        // Match by underlying symbol
        const sym = entry.symbol.toUpperCase();
        const matchingGroups = groups.filter(g => g.underlying.toUpperCase() === sym);
        const explanation: string[] = [];

        if (matchingGroups.length === 0) {
            explanation.push(`No option fill groups matched underlying ${sym}`);
            updates.push({
                entryId: entry.id,
                updates: { reconcile_status: 'NONE', match_explanation: explanation },
                reason: 'No matching option fill groups',
                reconcileStatus: 'NONE',
                matchExplanation: explanation,
                ambiguityCandidates: [],
            });
            continue;
        }

        // Separate entry (debit) and exit (credit) groups
        // For simplicity: first group chronologically is entry, subsequent are exits
        const sorted = matchingGroups.sort((a, b) =>
            new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime());

        const entryGroup = sorted[0];
        const exitGroups = sorted.slice(1);

        explanation.push(`Matched ${sorted.length} fill group(s) for ${sym}`);
        explanation.push(`Entry group: ${entryGroup.legs.length} leg(s), net cashflow $${entryGroup.netCashflow}`);

        const entryFillIds = entryGroup.legs.map(l => `alpaca:${l.fillId}`).join(',');

        if (exitGroups.length === 0) {
            // No exits yet
            updates.push({
                entryId: entry.id,
                updates: {
                    reconcile_status: 'NONE',
                    match_explanation: explanation,
                    entry_fill_id: entryFillIds,
                    net_debit_credit: entryGroup.netCashflow,
                    total_qty: entryGroup.totalContracts,
                    is_spread: entryGroup.legs.length > 1,
                    legs_json: entryGroup.legs,
                    system_update_reason: `auto-reconcile:${batchId}`,
                },
                reason: `Entry fills found but no exits yet`,
                reconcileStatus: 'NONE',
                matchExplanation: explanation,
                ambiguityCandidates: [],
            });
            continue;
        }

        // Compute PnL from cashflows
        // Total cashflow = sum of all group cashflows
        // Negative = paid (debit), positive = received (credit)
        let totalCashflow = entryGroup.netCashflow;
        let exitedContracts = 0;
        const exitFillIdParts: string[] = [];

        for (const eg of exitGroups) {
            totalCashflow += eg.netCashflow;
            exitedContracts += eg.totalContracts;
            explanation.push(`Exit group: ${eg.legs.length} leg(s), net cashflow $${eg.netCashflow}`);
            exitFillIdParts.push(...eg.legs.map(l => `alpaca:${l.fillId}`));
        }

        const realizedPnl = roundTo(totalCashflow, 2);
        const fullyExited = exitedContracts >= entryGroup.totalContracts;
        const reconcileStatus: ReconcileStatus = fullyExited ? 'MATCHED' : 'PARTIAL';

        explanation.push(`${fullyExited ? 'Fully' : 'Partially'} exited: ${exitedContracts}/${entryGroup.totalContracts} contracts`);
        explanation.push(`Realized PnL: $${realizedPnl}`);

        const BREAKEVEN_THRESHOLD = 1; // $1 for options
        let result: 'WIN' | 'LOSS' | 'BREAKEVEN';
        if (Math.abs(realizedPnl) < BREAKEVEN_THRESHOLD) {
            result = 'BREAKEVEN';
        } else if (realizedPnl > 0) {
            result = 'WIN';
        } else {
            result = 'LOSS';
        }

        updates.push({
            entryId: entry.id,
            updates: {
                status: fullyExited ? 'EXITED' : entry.status,
                reconcile_status: reconcileStatus,
                match_explanation: explanation,
                entry_fill_id: entryFillIds,
                exit_fill_id: exitFillIdParts.join(','),
                net_debit_credit: entryGroup.netCashflow,
                total_qty: entryGroup.totalContracts,
                exited_qty: exitedContracts,
                realized_pnl_dollars: realizedPnl,
                is_spread: entryGroup.legs.length > 1,
                legs_json: entryGroup.legs,
                result: fullyExited ? result : undefined,
                system_update_reason: `auto-reconcile:${batchId}`,
            },
            reason: fullyExited
                ? `Auto-reconciled: ${result} $${realizedPnl}`
                : `Partial exit: $${realizedPnl} on ${exitedContracts}/${entryGroup.totalContracts} contracts`,
            reconcileStatus,
            matchExplanation: explanation,
            ambiguityCandidates: [],
        });
    }

    return updates;
}

// =============================================================================
// Helpers
// =============================================================================

function extractStopLoss(entry: ReconcilableEntry): number | null {
    if (entry.stop_loss != null) return entry.stop_loss;

    if (entry.invalidation) {
        const parsed = parseFloat(entry.invalidation);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    if (entry.key_levels && typeof entry.key_levels === 'object') {
        const kl = entry.key_levels as Record<string, unknown>;
        if (typeof kl.stop === 'number') return kl.stop;
        if (typeof kl.stopLoss === 'number') return kl.stopLoss;
    }

    return null;
}

function dateDiffDays(a: string, b: string): number {
    const da = new Date(a + 'T00:00:00Z');
    const db = new Date(b + 'T00:00:00Z');
    return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function roundTo(n: number, decimals: number): number {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
}
