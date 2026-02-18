export const dynamic = 'force-dynamic';

/**
 * Schema Health API Route
 *
 * GET /api/dev/schema-health
 *
 * Verifies required tables and columns exist by querying
 * information_schema.columns directly via the service-role
 * Supabase client. Zero dependency on custom RPC functions.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   503 — server DB not configured
 *   200 — { status: "PASS"|"FAIL", totalChecked, found, missing, checkedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import {
    isServerSupabaseConfigured,
    createServerSupabase,
} from '@/lib/supabase/server';

// =============================================================================
// Required columns — ground truth from migrations
// =============================================================================

interface ColCheck {
    table: string;
    column: string;
}

const REQUIRED: ColCheck[] = [
    // broker_trade_fills
    { table: 'broker_trade_fills', column: 'id' },
    { table: 'broker_trade_fills', column: 'broker' },
    { table: 'broker_trade_fills', column: 'broker_trade_id' },
    { table: 'broker_trade_fills', column: 'symbol' },
    { table: 'broker_trade_fills', column: 'filled_at' },
    { table: 'broker_trade_fills', column: 'normalized' },
    { table: 'broker_trade_fills', column: 'created_at' },

    // premarket_journal_entries
    { table: 'premarket_journal_entries', column: 'id' },
    { table: 'premarket_journal_entries', column: 'effective_date' },
    { table: 'premarket_journal_entries', column: 'symbol' },
    { table: 'premarket_journal_entries', column: 'status' },
    { table: 'premarket_journal_entries', column: 'trade_direction' },
    { table: 'premarket_journal_entries', column: 'manual_override' },
    { table: 'premarket_journal_entries', column: 'entry_fill_id' },
    { table: 'premarket_journal_entries', column: 'exit_fill_id' },
    { table: 'premarket_journal_entries', column: 'reconcile_status' },
    { table: 'premarket_journal_entries', column: 'match_explanation' },
    { table: 'premarket_journal_entries', column: 'avg_entry_price' },
    { table: 'premarket_journal_entries', column: 'total_qty' },
    { table: 'premarket_journal_entries', column: 'exited_qty' },
    { table: 'premarket_journal_entries', column: 'realized_pnl_dollars' },
    { table: 'premarket_journal_entries', column: 'unrealized_pnl_dollars' },
    { table: 'premarket_journal_entries', column: 'risk_dollars' },
    { table: 'premarket_journal_entries', column: 'is_draft' },
    { table: 'premarket_journal_entries', column: 'ledger_write_failed' },

    // options_journal_entries
    { table: 'options_journal_entries', column: 'id' },
    { table: 'options_journal_entries', column: 'created_at' },
    { table: 'options_journal_entries', column: 'symbol' },
    { table: 'options_journal_entries', column: 'status' },
    { table: 'options_journal_entries', column: 'is_spread' },
    { table: 'options_journal_entries', column: 'legs_json' },
    { table: 'options_journal_entries', column: 'net_debit_credit' },
    { table: 'options_journal_entries', column: 'reconcile_status' },
    { table: 'options_journal_entries', column: 'match_explanation' },
    { table: 'options_journal_entries', column: 'manual_override' },
    { table: 'options_journal_entries', column: 'realized_pnl_dollars' },
    { table: 'options_journal_entries', column: 'risk_dollars' },
    { table: 'options_journal_entries', column: 'is_draft' },
    { table: 'options_journal_entries', column: 'ledger_write_failed' },

    // trade_ledger
    { table: 'trade_ledger', column: 'id' },
    { table: 'trade_ledger', column: 'entry_id' },
    { table: 'trade_ledger', column: 'desk' },
    { table: 'trade_ledger', column: 'symbol' },
    { table: 'trade_ledger', column: 'trade_direction' },
    { table: 'trade_ledger', column: 'realized_pnl' },
    { table: 'trade_ledger', column: 'created_at' },

    // morning_run_runs
    { table: 'morning_run_runs', column: 'id' },
    { table: 'morning_run_runs', column: 'run_id' },
    { table: 'morning_run_runs', column: 'run_date' },
    { table: 'morning_run_runs', column: 'generated_at' },
    { table: 'morning_run_runs', column: 'payload' },
];

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    // Refuse to run when server DB is not configured
    if (!isServerSupabaseConfigured()) {
        return NextResponse.json(
            {
                status: 'ERROR',
                errorCode: 'DB_NOT_CONFIGURED',
                checkedAt: new Date().toISOString(),
            },
            { status: 503 },
        );
    }

    try {
        const supabase = createServerSupabase();

        // Fetch all columns in the public schema in one query
        const { data: columns, error } = await supabase
            .from('information_schema.columns' as string)
            .select('table_name, column_name')
            .eq('table_schema', 'public');

        // If information_schema query fails (PostgREST may block it),
        // fall back to probing each table with select().limit(0)
        let existingCols: Set<string>;

        if (error || !columns) {
            // Fallback: probe tables individually
            existingCols = new Set<string>();
            const tables = Array.from(new Set(REQUIRED.map((r) => r.table)));

            for (const table of tables) {
                const tableCols = REQUIRED.filter((r) => r.table === table).map(
                    (r) => r.column,
                );
                const selectStr = tableCols.join(',');

                const probe = await supabase
                    .from(table)
                    .select(selectStr)
                    .limit(0);

                if (!probe.error) {
                    // All columns exist for this table
                    for (const col of tableCols) {
                        existingCols.add(`${table}.${col}`);
                    }
                } else {
                    // Some columns may be missing — probe individually
                    for (const col of tableCols) {
                        const single = await supabase
                            .from(table)
                            .select(col)
                            .limit(0);
                        if (!single.error) {
                            existingCols.add(`${table}.${col}`);
                        }
                    }
                }
            }
        } else {
            existingCols = new Set(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (columns as any[]).map(
                    (c: { table_name: string; column_name: string }) =>
                        `${c.table_name}.${c.column_name}`,
                ),
            );
        }

        // Compute results
        const missing: ColCheck[] = [];
        let found = 0;

        for (const check of REQUIRED) {
            if (existingCols.has(`${check.table}.${check.column}`)) {
                found++;
            } else {
                missing.push(check);
            }
        }

        return NextResponse.json({
            status: missing.length === 0 ? 'PASS' : 'FAIL',
            totalChecked: REQUIRED.length,
            found,
            missing,
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        console.error('[SchemaHealth] Error:', message);
        return NextResponse.json(
            {
                status: 'FAIL',
                error: message,
                checkedAt: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
