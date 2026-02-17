/**
 * Schema Health Tests
 *
 * Tests the checkSchema() helper which probes each required table
 * with SELECT ... LIMIT 0 to verify columns exist.
 *
 * Mocks:
 * - @/lib/supabase/server → controls createServerSupabase
 */

// ── Mock supabase/server before any imports ─────────────────────────────

const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
    isServerSupabaseConfigured: () => true,
    createServerSupabase: () => ({
        from: (table: string) => mockFrom(table),
    }),
}));

import { checkSchema, type SchemaCheckResult } from '@/lib/guards/schema-check';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build a mock .from() chain that succeeds (no error) */
function successChain() {
    return {
        select: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
        }),
    };
}

/** Build a mock .from() chain that fails for the batch (table missing) */
function tableErrorChain(errMsg: string) {
    return {
        select: () => ({
            limit: () => Promise.resolve({ data: null, error: { message: errMsg } }),
        }),
    };
}

/** Build a mock .from() chain where batch fails but individual column probes succeed/fail */
function columnProbeChain(missingColumns: Set<string>) {
    const missingArr = Array.from(missingColumns);
    return {
        select: (cols: string) => ({
            limit: () => {
                // If it's a batch select (multiple columns), fail to trigger per-column probing
                if (cols.includes(',')) {
                    return Promise.resolve({
                        data: null,
                        error: { message: `column "${missingArr[0]}" does not exist` },
                    });
                }
                // Single column probe — succeed or fail based on set
                const col = cols.trim();
                if (missingColumns.has(col)) {
                    return Promise.resolve({
                        data: null,
                        error: { message: `column "${col}" does not exist` },
                    });
                }
                return Promise.resolve({ data: [], error: null });
            },
        }),
    };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('checkSchema', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns PASS when all tables and columns exist', async () => {
        mockFrom.mockReturnValue(successChain());

        const result: SchemaCheckResult = await checkSchema();

        expect(result.status).toBe('PASS');
        expect(result.missing).toHaveLength(0);
        expect(result.found).toBe(result.totalChecked);
        expect(result.tables.length).toBeGreaterThan(0);
        expect(result.checkedAt).toBeDefined();
    });

    test('returns FAIL when an entire table is missing', async () => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'trade_ledger') {
                return tableErrorChain("Could not find the table 'public.trade_ledger' in the schema cache");
            }
            return successChain();
        });

        const result = await checkSchema();

        expect(result.status).toBe('FAIL');
        expect(result.missing.length).toBeGreaterThan(0);
        // All trade_ledger columns should be missing
        const ledgerMissing = result.missing.filter(m => m.startsWith('trade_ledger.'));
        expect(ledgerMissing.length).toBe(3); // entry_id, realized_pnl, desk
    });

    test('returns FAIL when specific columns are missing', async () => {
        mockFrom.mockImplementation((table: string) => {
            if (table === 'premarket_journal_entries') {
                return columnProbeChain(new Set(['total_qty', 'exited_qty']));
            }
            return successChain();
        });

        const result = await checkSchema();

        expect(result.status).toBe('FAIL');
        expect(result.missing).toContain('premarket_journal_entries.total_qty');
        expect(result.missing).toContain('premarket_journal_entries.exited_qty');
        expect(result.found).toBe(result.totalChecked - 2);
    });

    test('returns correct table list', async () => {
        mockFrom.mockReturnValue(successChain());

        const result = await checkSchema();

        expect(result.tables).toContain('broker_trade_fills');
        expect(result.tables).toContain('premarket_journal_entries');
        expect(result.tables).toContain('options_journal_entries');
        expect(result.tables).toContain('morning_run_runs');
        expect(result.tables).toContain('trade_ledger');
    });
});
