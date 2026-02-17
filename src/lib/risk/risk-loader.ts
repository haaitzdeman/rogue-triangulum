/**
 * Risk Loader — Unified Risk Entry Source
 *
 * Single function to load risk-relevant entries from both desks
 * (premarket + options) for a given date. Used by:
 *   - /api/today/risk-state
 *   - Morning Run risk gating
 *
 * All DB access happens here — risk-engine.ts stays pure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RiskEntry } from './risk-engine';

export type DeskTag = 'PREMARKET' | 'OPTIONS';

export interface TaggedRiskEntry extends RiskEntry {
    desk: DeskTag;
}

/**
 * Load all risk-relevant entries for a date, merged from both desks.
 * Normalizes symbol to uppercase and tags each entry with its desk.
 *
 * Throws on DB errors so callers can fail-closed.
 */
export async function loadRiskEntriesForDate(
    supabase: SupabaseClient,
    date: string,
): Promise<TaggedRiskEntry[]> {
    // ── Premarket entries ──────────────────────────────────────────────
    const { data: premarketRaw, error: pmErr } = await supabase
        .from('premarket_journal_entries')
        .select('id, symbol, status, entry_price, exit_price, size, total_qty, realized_pnl_dollars, trade_direction, is_draft, risk_dollars')
        .eq('effective_date', date);

    if (pmErr) {
        throw new Error(`Risk loader: premarket read failed — ${pmErr.message}`);
    }

    const premarket: TaggedRiskEntry[] = (premarketRaw || []).map(
        (e: Record<string, unknown>) => ({
            id: e.id as string,
            symbol: ((e.symbol as string) || '').toUpperCase(),
            status: e.status as string,
            entry_price: e.entry_price as number | null,
            exit_price: e.exit_price as number | null,
            size: e.size as number | null,
            total_qty: e.total_qty as number | null,
            realized_pnl_dollars: e.realized_pnl_dollars as number | null,
            trade_direction: e.trade_direction as string,
            is_draft: (e.is_draft as boolean) ?? false,
            risk_dollars: e.risk_dollars as number | null,
            desk: 'PREMARKET' as DeskTag,
        }),
    );

    // ── Options entries ────────────────────────────────────────────────
    const { data: optionsRaw, error: optErr } = await supabase
        .from('options_journal_entries')
        .select('id, symbol, status, realized_pnl_dollars, is_draft, risk_dollars')
        .gte('created_at', `${date}T00:00:00`);

    if (optErr) {
        throw new Error(`Risk loader: options read failed — ${optErr.message}`);
    }

    const options: TaggedRiskEntry[] = (optionsRaw || []).map(
        (e: Record<string, unknown>) => ({
            id: e.id as string,
            symbol: ((e.symbol as string) || '').toUpperCase(),
            status: e.status as string,
            realized_pnl_dollars: e.realized_pnl_dollars as number | null,
            is_draft: (e.is_draft as boolean) ?? false,
            risk_dollars: e.risk_dollars as number | null,
            desk: 'OPTIONS' as DeskTag,
        }),
    );

    return [...premarket, ...options];
}
