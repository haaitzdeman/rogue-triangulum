/**
 * Schema Check Helper
 *
 * Probes each required table with SELECT ... LIMIT 0 to verify columns exist.
 * PostgREST validates column names against its schema cache even with limit(0),
 * so missing columns produce immediate errors without reading data rows.
 *
 * This module is separate from the route handler so it can be imported
 * by both the schema-health API route and the health aggregator without
 * violating Next.js route export constraints.
 */

import { createServerSupabase } from '@/lib/supabase/server';

// =============================================================================
// Required Schema Definition
// =============================================================================

interface RequiredColumn {
    table: string;
    column: string;
}

const REQUIRED_SCHEMA: RequiredColumn[] = [
    // broker_trade_fills
    { table: 'broker_trade_fills', column: 'id' },
    { table: 'broker_trade_fills', column: 'trade_id' },
    { table: 'broker_trade_fills', column: 'symbol' },
    { table: 'broker_trade_fills', column: 'side' },
    { table: 'broker_trade_fills', column: 'qty' },
    { table: 'broker_trade_fills', column: 'price' },

    // premarket_journal_entries — core
    { table: 'premarket_journal_entries', column: 'id' },
    { table: 'premarket_journal_entries', column: 'symbol' },
    { table: 'premarket_journal_entries', column: 'effective_date' },
    { table: 'premarket_journal_entries', column: 'status' },
    { table: 'premarket_journal_entries', column: 'trade_direction' },

    // premarket_journal_entries — reconcile/scale columns
    { table: 'premarket_journal_entries', column: 'reconcile_status' },
    { table: 'premarket_journal_entries', column: 'match_explanation' },
    { table: 'premarket_journal_entries', column: 'manual_override' },
    { table: 'premarket_journal_entries', column: 'entry_fill_id' },
    { table: 'premarket_journal_entries', column: 'exit_fill_id' },
    { table: 'premarket_journal_entries', column: 'avg_entry_price' },
    { table: 'premarket_journal_entries', column: 'total_qty' },
    { table: 'premarket_journal_entries', column: 'exited_qty' },
    { table: 'premarket_journal_entries', column: 'realized_pnl_dollars' },

    // options_journal_entries — core
    { table: 'options_journal_entries', column: 'id' },
    { table: 'options_journal_entries', column: 'symbol' },
    { table: 'options_journal_entries', column: 'status' },

    // options_journal_entries — spread + reconcile
    { table: 'options_journal_entries', column: 'is_spread' },
    { table: 'options_journal_entries', column: 'legs_json' },
    { table: 'options_journal_entries', column: 'net_debit_credit' },
    { table: 'options_journal_entries', column: 'reconcile_status' },
    { table: 'options_journal_entries', column: 'manual_override' },
    { table: 'options_journal_entries', column: 'realized_pnl_dollars' },

    // ledger_write_failed — safety flag
    { table: 'premarket_journal_entries', column: 'ledger_write_failed' },
    { table: 'options_journal_entries', column: 'ledger_write_failed' },

    // morning_run_runs — persistence
    { table: 'morning_run_runs', column: 'run_id' },
    { table: 'morning_run_runs', column: 'run_date' },
    { table: 'morning_run_runs', column: 'payload' },

    // trade_ledger — immutable PnL records
    { table: 'trade_ledger', column: 'entry_id' },
    { table: 'trade_ledger', column: 'realized_pnl' },
    { table: 'trade_ledger', column: 'desk' },
];

// =============================================================================
// Types
// =============================================================================

export interface SchemaCheckResult {
    status: 'PASS' | 'FAIL';
    totalChecked: number;
    found: number;
    missing: string[];
    tables: string[];
    checkedAt: string;
}

// =============================================================================
// Check Logic
// =============================================================================

/**
 * Probe each required table to verify columns exist.
 * Groups columns by table, runs one SELECT ... LIMIT 0 per table.
 * Returns structured result — never throws.
 */
export async function checkSchema(): Promise<SchemaCheckResult> {
    const supabase = createServerSupabase();

    // Group columns by table
    const tableColumnsMap = new Map<string, string[]>();
    for (const req of REQUIRED_SCHEMA) {
        const cols = tableColumnsMap.get(req.table) || [];
        cols.push(req.column);
        tableColumnsMap.set(req.table, cols);
    }

    const tables = Array.from(tableColumnsMap.keys());
    const missing: string[] = [];

    // Probe each table
    const entries = Array.from(tableColumnsMap.entries());
    for (const [table, columns] of entries) {
        const selectList = columns.join(', ');
        const { error } = await supabase
            .from(table)
            .select(selectList)
            .limit(0);

        if (error) {
            const errMsg = error.message || '';

            if (errMsg.includes('Could not find the table') || (errMsg.includes('relation') && errMsg.includes('does not exist'))) {
                // Entire table missing — mark all its columns
                for (const col of columns) {
                    missing.push(`${table}.${col}`);
                }
            } else {
                // Try to identify specific missing columns by probing individually
                for (const col of columns) {
                    const { error: colErr } = await supabase
                        .from(table)
                        .select(col)
                        .limit(0);
                    if (colErr) {
                        missing.push(`${table}.${col}`);
                    }
                }
            }
        }
    }

    const totalChecked = REQUIRED_SCHEMA.length;
    const found = totalChecked - missing.length;

    return {
        status: missing.length === 0 ? 'PASS' : 'FAIL',
        totalChecked,
        found,
        missing,
        tables,
        checkedAt: new Date().toISOString(),
    };
}
