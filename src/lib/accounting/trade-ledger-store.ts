/**
 * Trade Ledger Store — Immutable Realized PnL Records
 *
 * Append-only: once a row is written for an entry_id, it is never updated.
 * The DB trigger enforces this at the Postgres level.
 *
 * All functions accept a SupabaseClient (server service-role).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface LedgerEntryParams {
    entryId: string;
    desk: 'PREMARKET' | 'OPTIONS';
    symbol: string;
    tradeDirection: string;
    entryTimestamp: string;
    exitTimestamp: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    realizedPnl: number;
    rMultiple?: number | null;
    reconcileBatchId?: string | null;
}

export interface DailySummary {
    realizedPnl: number;
    tradeCount: number;
    winRate: number;
    avgR: number | null;
    symbols: string[];
}

// =============================================================================
// Write (idempotent insert)
// =============================================================================

/**
 * Insert a ledger row for the given entry_id.
 * Idempotent: if a row already exists for this entry_id, silently skips.
 */
export async function writeLedgerEntry(
    supabase: SupabaseClient,
    params: LedgerEntryParams,
): Promise<{ written: boolean }> {
    // Check if already exists
    const { data: existing } = await supabase
        .from('trade_ledger')
        .select('id')
        .eq('entry_id', params.entryId)
        .limit(1);

    if (existing && existing.length > 0) {
        return { written: false }; // idempotent skip
    }

    const row = {
        entry_id: params.entryId,
        desk: params.desk,
        symbol: params.symbol,
        trade_direction: params.tradeDirection,
        entry_timestamp: params.entryTimestamp,
        exit_timestamp: params.exitTimestamp,
        entry_price: params.entryPrice,
        exit_price: params.exitPrice,
        quantity: params.quantity,
        realized_pnl: params.realizedPnl,
        r_multiple: params.rMultiple ?? null,
        reconcile_batch_id: params.reconcileBatchId ?? null,
    };

    const { error } = await supabase
        .from('trade_ledger')
        .insert(row);

    if (error) {
        console.error('[TradeLedger] writeLedgerEntry error:', error);
        throw new Error(`Failed to write ledger entry: ${error.message}`);
    }

    return { written: true };
}

// =============================================================================
// Read — Realized PnL for date
// =============================================================================

/**
 * Sum realized PnL from the ledger for trades exiting on a given date.
 */
export async function loadRealizedPnLForDate(
    supabase: SupabaseClient,
    date: string,
): Promise<number> {
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data, error } = await supabase
        .from('trade_ledger')
        .select('realized_pnl')
        .gte('exit_timestamp', dayStart)
        .lte('exit_timestamp', dayEnd);

    if (error) {
        console.error('[TradeLedger] loadRealizedPnLForDate error:', error);
        throw new Error(`Failed to load realized PnL: ${error.message}`);
    }

    let total = 0;
    for (const row of data ?? []) {
        total += Number(row.realized_pnl) || 0;
    }
    return total;
}

// =============================================================================
// Read — Daily Summary
// =============================================================================

/**
 * Aggregate daily summary from ledger for trades exiting on a given date.
 */
export async function loadDailySummary(
    supabase: SupabaseClient,
    date: string,
): Promise<DailySummary> {
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data, error } = await supabase
        .from('trade_ledger')
        .select('symbol, realized_pnl, r_multiple')
        .gte('exit_timestamp', dayStart)
        .lte('exit_timestamp', dayEnd);

    if (error) {
        console.error('[TradeLedger] loadDailySummary error:', error);
        throw new Error(`Failed to load daily summary: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) {
        return { realizedPnl: 0, tradeCount: 0, winRate: 0, avgR: null, symbols: [] };
    }

    let totalPnl = 0;
    let wins = 0;
    let rSum = 0;
    let rCount = 0;
    const symbolSet = new Set<string>();

    for (const row of rows) {
        const pnl = Number(row.realized_pnl) || 0;
        totalPnl += pnl;
        if (pnl > 0) wins++;
        symbolSet.add(row.symbol);

        if (row.r_multiple != null) {
            rSum += Number(row.r_multiple);
            rCount++;
        }
    }

    return {
        realizedPnl: totalPnl,
        tradeCount: rows.length,
        winRate: rows.length > 0 ? wins / rows.length : 0,
        avgR: rCount > 0 ? rSum / rCount : null,
        symbols: Array.from(symbolSet).sort(),
    };
}
