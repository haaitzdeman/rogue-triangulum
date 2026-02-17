/**
 * Journal Linker
 *
 * After broker sync inserts fills, this module:
 * 1. Auto-links fills to matching premarket_journal_entries
 * 2. Creates new entries for unmatched fills (source=BROKER_IMPORT)
 * 3. Runs auto-reconciliation to close ENTERED entries with paired fills
 *
 * RULES:
 * - Never overwrites user_note
 * - Only fills missing fields
 * - Respects manual_override on reconciliation
 *
 * Uses centralized untypedFrom() helper because premarket_journal_entries
 * columns aren't fully typed. See src/lib/supabase/untyped.ts.
 */

import { untypedFrom } from '@/lib/supabase/untyped';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import type { BrokerFill } from './types';
import { reconcileEntries, reconcileOptionsEntries, type ReconcilableEntry, type ReconcilableOptionsEntry } from './reconcile-engine';
import { groupOptionsFills } from './options-fill-grouper';
import { writeLedgerEntry } from '@/lib/accounting/trade-ledger-store';

// =============================================================================
// Link + Reconcile
// =============================================================================

/**
 * Link broker fills to journal entries, then reconcile outcomes.
 * For each fill:
 *   1. Look for premarket_journal_entries matching symbol + effective_date
 *   2. If found, update outcome JSON with broker fill data (preserve user notes)
 *   3. If not found, create new entry with source=BROKER_IMPORT
 * Then run reconciliation to auto-close ENTERED entries.
 *
 * Returns counts of linked/created entries and reconciled outcomes.
 */
export async function linkFillsToJournal(
    fills: BrokerFill[],
    batchId?: string,
): Promise<{ linked: number; created: number; reconciled: number }> {
    let linked = 0;
    let created = 0;

    const effectiveBatchId = batchId || `sync-${Date.now()}`;

    for (const fill of fills) {
        // Extract date portion from filledAt for matching
        const fillDate = fill.filledAt.slice(0, 10); // YYYY-MM-DD

        // Look for existing journal entry matching symbol + date
        const { data: existing } = await untypedFrom('premarket_journal_entries')
            .select('id, outcome, user_note')
            .eq('symbol', fill.symbol.toUpperCase())
            .eq('effective_date', fillDate)
            .limit(1)
            .maybeSingle();

        if (existing) {
            // Merge broker fill into outcome, preserve user notes
            const currentOutcome = (existing.outcome as Record<string, unknown>) ?? {};
            const updatedOutcome = {
                ...currentOutcome,
                brokerFill: {
                    side: fill.side,
                    qty: fill.qty,
                    price: fill.price,
                    filledAt: fill.filledAt,
                    orderId: fill.orderId,
                    source: 'BROKER_IMPORT',
                },
            };

            await untypedFrom('premarket_journal_entries')
                .update({ outcome: updatedOutcome })
                .eq('id', existing.id);

            linked++;
        } else {
            // Create new journal entry for unmatched fill
            const newEntry = {
                effective_date: fillDate,
                symbol: fill.symbol.toUpperCase(),
                gap_pct: 0,
                direction: fill.side === 'buy' ? 'UP' : 'DOWN',
                play_type: 'CONTINUATION',
                confidence: 'LOW',
                low_confidence: false,
                because: `Auto-imported from ${fill.broker} broker sync`,
                key_levels: {},
                invalidation: 'N/A',
                risk_note: 'Broker imported trade',
                analog_stats: {},
                scan_generated_at: new Date().toISOString(),
                config_used: { source: 'BROKER_IMPORT' },
                status: 'ENTERED',
                trade_direction: fill.side === 'buy' ? 'LONG' : 'SHORT',
                entry_price: fill.price,
                size: fill.qty,
                entry_time: fill.filledAt,
                entry_fill_id: `${fill.broker}:${fill.tradeId}`,
                system_update_reason: `broker-import:${effectiveBatchId}`,
                outcome: {
                    brokerFill: {
                        side: fill.side,
                        qty: fill.qty,
                        price: fill.price,
                        filledAt: fill.filledAt,
                        orderId: fill.orderId,
                        source: 'BROKER_IMPORT',
                    },
                },
            };

            const { error } = await untypedFrom('premarket_journal_entries')
                .insert(newEntry);

            if (!error) {
                created++;
            } else {
                console.error('[JournalLinker] insert error:', error.message.slice(0, 200));
            }
        }
    }

    // =========================================================================
    // Auto-Reconcile: find ENTERED entries and pair with fills to auto-close
    // =========================================================================
    let reconciled = 0;
    try {
        reconciled = await runReconciliation(fills, effectiveBatchId);
    } catch (err) {
        console.error('[JournalLinker] reconciliation error:', String(err).slice(0, 200));
    }

    return { linked, created, reconciled };
}

/**
 * Run reconciliation against ENTERED journal entries that have fills.
 * Returns number of entries reconciled.
 */
async function runReconciliation(fills: BrokerFill[], batchId: string): Promise<number> {
    if (fills.length === 0) return 0;

    // Get unique symbols from fills
    const symbols = Array.from(new Set(fills.map(f => f.symbol.toUpperCase())));

    // Fetch ENTERED entries for these symbols (include scale fields)
    const { data: entries, error } = await untypedFrom('premarket_journal_entries')
        .select('id, symbol, effective_date, status, trade_direction, entry_price, exit_price, size, invalidation, key_levels, manual_override, entry_fill_id, exit_fill_id, avg_entry_price, total_qty, exited_qty, realized_pnl_dollars')
        .in('symbol', symbols)
        .in('status', ['ENTERED', 'OPEN']);

    if (error || !entries || entries.length === 0) return 0;

    // Cast to ReconcilableEntry
    const reconcilable = (entries as Record<string, unknown>[]).map(e => ({
        id: e.id as string,
        symbol: e.symbol as string,
        effective_date: e.effective_date as string,
        status: e.status as string,
        trade_direction: (e.trade_direction as string) || 'LONG',
        entry_price: e.entry_price as number | null,
        exit_price: e.exit_price as number | null,
        size: e.size as number | null,
        invalidation: e.invalidation as string | null,
        key_levels: e.key_levels as Record<string, unknown> | null,
        manual_override: e.manual_override as boolean,
        entry_fill_id: e.entry_fill_id as string | null,
        exit_fill_id: e.exit_fill_id as string | null,
        avg_entry_price: e.avg_entry_price as number | null,
        total_qty: e.total_qty as number | null,
        exited_qty: e.exited_qty as number | null,
        realized_pnl_dollars: e.realized_pnl_dollars as number | null,
    })) satisfies ReconcilableEntry[];

    // Run reconciliation engine (pure logic)
    const updates = reconcileEntries(reconcilable, fills, batchId);

    // Apply updates to DB
    let applied = 0;
    for (const update of updates) {
        const { error: updateErr } = await untypedFrom('premarket_journal_entries')
            .update(update.updates)
            .eq('id', update.entryId);

        if (updateErr) {
            console.error('[JournalLinker] reconcile update error:', updateErr.message.slice(0, 200));
        } else if (update.reconcileStatus === 'MATCHED' || update.reconcileStatus === 'PARTIAL') {
            applied++;

            // Write to immutable trade ledger when fully EXITED
            if (update.updates.status === 'EXITED' && isServerSupabaseConfigured()) {
                try {
                    const u = update.updates as Record<string, unknown>;
                    const entry = reconcilable.find(e => e.id === update.entryId);
                    await writeLedgerEntry(createServerSupabase(), {
                        entryId: update.entryId,
                        desk: 'PREMARKET',
                        symbol: entry?.symbol ?? '',
                        tradeDirection: (entry?.trade_direction || 'LONG'),
                        entryTimestamp: entry?.effective_date ? `${entry.effective_date}T09:30:00Z` : new Date().toISOString(),
                        exitTimestamp: (u.exit_time as string) || new Date().toISOString(),
                        entryPrice: Number(u.avg_entry_price ?? u.entry_price ?? entry?.entry_price ?? 0),
                        exitPrice: Number(u.exit_price ?? 0),
                        quantity: Number(u.total_qty ?? entry?.total_qty ?? entry?.size ?? 0),
                        realizedPnl: Number(u.realized_pnl_dollars ?? 0),
                        rMultiple: u.r_multiple != null ? Number(u.r_multiple) : null,
                        reconcileBatchId: batchId,
                    });
                } catch (ledgerErr) {
                    // FAIL-LOUD: mark the journal entry so the failure is visible
                    console.error(`[LEDGER_WRITE_FAILED] entryId=${update.entryId} desk=PREMARKET`, ledgerErr);
                    try {
                        await untypedFrom('premarket_journal_entries')
                            .update({ ledger_write_failed: true })
                            .eq('id', update.entryId);
                    } catch (markErr) {
                        console.error(`[LEDGER_WRITE_FAILED] Could not mark entry ${update.entryId}:`, markErr);
                    }
                }
            }
        }
    }

    return applied;
}

// =============================================================================
// Options Journal Reconciliation
// =============================================================================

/**
 * Link option fills to options_journal_entries and reconcile.
 * Returns count of reconciled entries.
 */
export async function linkFillsToOptionsJournal(
    fills: BrokerFill[],
    batchId?: string,
): Promise<{ reconciled: number }> {
    const effectiveBatchId = batchId || `sync-opts-${Date.now()}`;

    // Group option fills
    const optionFills = fills.filter(f => f.assetClass === 'option');
    if (optionFills.length === 0) return { reconciled: 0 };

    const groups = groupOptionsFills(optionFills);
    if (groups.length === 0) return { reconciled: 0 };

    // Get unique underlying symbols
    const underlyings = Array.from(new Set(groups.map(g => g.underlying.toUpperCase())));

    // Fetch options journal entries
    const { data: entries, error } = await untypedFrom('options_journal_entries')
        .select('id, symbol, status, scanned_at, selected_contract, is_spread, legs_json, manual_override, entry_fill_id, exit_fill_id, total_qty, exited_qty, net_debit_credit')
        .in('symbol', underlyings)
        .in('status', ['ENTERED', 'OPEN', 'PLANNED']);

    if (error || !entries || entries.length === 0) return { reconciled: 0 };

    const reconcilable = (entries as Record<string, unknown>[]).map(e => ({
        id: e.id as string,
        symbol: e.symbol as string,
        status: e.status as string,
        scanned_at: e.scanned_at as string | undefined,
        selected_contract: e.selected_contract as ReconcilableOptionsEntry['selected_contract'],
        is_spread: e.is_spread as boolean | undefined,
        legs_json: e.legs_json as unknown[] | null,
        manual_override: e.manual_override as boolean,
        entry_fill_id: e.entry_fill_id as string | null,
        exit_fill_id: e.exit_fill_id as string | null,
        total_qty: e.total_qty as number | null,
        exited_qty: e.exited_qty as number | null,
        net_debit_credit: e.net_debit_credit as number | null,
    })) satisfies ReconcilableOptionsEntry[];

    const updates = reconcileOptionsEntries(reconcilable, groups, effectiveBatchId);

    let applied = 0;
    for (const update of updates) {
        const { error: updateErr } = await untypedFrom('options_journal_entries')
            .update(update.updates)
            .eq('id', update.entryId);

        if (updateErr) {
            console.error('[JournalLinker] options reconcile error:', updateErr.message.slice(0, 200));
        } else if (update.reconcileStatus === 'MATCHED' || update.reconcileStatus === 'PARTIAL') {
            applied++;

            // Write to immutable trade ledger when fully EXITED
            if (update.updates.status === 'EXITED' && isServerSupabaseConfigured()) {
                try {
                    const u = update.updates as Record<string, unknown>;
                    const entry = reconcilable.find(e => e.id === update.entryId);
                    await writeLedgerEntry(createServerSupabase(), {
                        entryId: update.entryId,
                        desk: 'OPTIONS',
                        symbol: entry?.symbol ?? '',
                        tradeDirection: 'LONG', // options default
                        entryTimestamp: entry?.scanned_at ?? new Date().toISOString(),
                        exitTimestamp: new Date().toISOString(),
                        entryPrice: Math.abs(Number(u.net_debit_credit ?? entry?.net_debit_credit ?? 0)),
                        exitPrice: Math.abs(Number(u.realized_pnl_dollars ?? 0) + Number(u.net_debit_credit ?? entry?.net_debit_credit ?? 0)),
                        quantity: Number(u.total_qty ?? entry?.total_qty ?? 0),
                        realizedPnl: Number(u.realized_pnl_dollars ?? 0),
                        rMultiple: null,
                        reconcileBatchId: batchId,
                    });
                } catch (ledgerErr) {
                    // FAIL-LOUD: mark the journal entry so the failure is visible
                    console.error(`[LEDGER_WRITE_FAILED] entryId=${update.entryId} desk=OPTIONS`, ledgerErr);
                    try {
                        await untypedFrom('options_journal_entries')
                            .update({ ledger_write_failed: true })
                            .eq('id', update.entryId);
                    } catch (markErr) {
                        console.error(`[LEDGER_WRITE_FAILED] Could not mark entry ${update.entryId}:`, markErr);
                    }
                }
            }
        }
    }

    return { reconciled: applied };
}
