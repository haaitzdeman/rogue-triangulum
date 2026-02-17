/**
 * Fill Store
 *
 * Supabase CRUD for broker_trade_fills table.
 * Handles dedup via upsert on broker_trade_id.
 *
 * Uses centralized untypedFrom() helper because broker_trade_fills
 * is not in generated database.types.ts. See src/lib/supabase/untyped.ts.
 */

import { untypedFrom } from '@/lib/supabase/untyped';
import type { BrokerFill } from './types';

// =============================================================================
// Upsert (with dedup)
// =============================================================================

/**
 * Upsert fills into broker_trade_fills.
 * Deduplicates on broker_trade_id — existing rows are skipped (not updated).
 * Returns counts of inserted vs skipped.
 */
export async function upsertFills(
    fills: BrokerFill[]
): Promise<{ inserted: number; skipped: number }> {
    if (fills.length === 0) return { inserted: 0, skipped: 0 };

    // Build rows for insert
    const rows = fills.map((f) => ({
        broker: f.broker,
        broker_trade_id: `${f.broker}:${f.tradeId}`,
        payload: f as unknown as Record<string, unknown>,
        normalized: f as unknown as Record<string, unknown>,
        filled_at: f.filledAt,
        symbol: f.symbol,
    }));

    // Use upsert with onConflict to skip duplicates
    const { data, error } = await untypedFrom('broker_trade_fills')
        .upsert(rows, {
            onConflict: 'broker_trade_id',
            ignoreDuplicates: true,
        })
        .select('id');

    if (error) {
        console.error('[FillStore] upsert error:', error.message);
        throw new Error(`Fill upsert failed: ${error.message.slice(0, 200)}`);
    }

    const inserted = data?.length ?? 0;
    const skipped = fills.length - inserted;

    return { inserted, skipped };
}

// =============================================================================
// Query
// =============================================================================

/**
 * Query fills from the database with optional filters.
 * Returns normalized BrokerFill objects.
 */
export async function queryFills(filters?: {
    since?: string;
    until?: string;
    symbol?: string;
}): Promise<BrokerFill[]> {
    let query = untypedFrom('broker_trade_fills')
        .select('normalized, filled_at')
        .order('filled_at', { ascending: false });

    if (filters?.since) {
        query = query.gte('filled_at', new Date(filters.since).toISOString());
    }
    if (filters?.until) {
        query = query.lte('filled_at', new Date(filters.until).toISOString());
    }
    if (filters?.symbol) {
        query = query.eq('symbol', filters.symbol.toUpperCase());
    }

    const { data, error } = await query;

    if (error) {
        console.error('[FillStore] query error:', error.message);
        throw new Error(`Fill query failed: ${error.message.slice(0, 200)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => row.normalized as BrokerFill);
}
