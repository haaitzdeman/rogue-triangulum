/**
 * Trade Ledger Store — Unit Tests
 *
 * Tests writeLedgerEntry (idempotent), loadRealizedPnLForDate, loadDailySummary
 * using a mock Supabase client.
 */

import {
    writeLedgerEntry,
    loadRealizedPnLForDate,
    loadDailySummary,
} from '../trade-ledger-store';

// =============================================================================
// Mock Supabase client builder
// =============================================================================

function mockSupabase(overrides: {
    selectResult?: { data: unknown[] | null; error: null | { message: string } };
    insertResult?: { error: null | { message: string } };
} = {}) {
    const chain: Record<string, jest.Mock> = {};

    chain.from = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.gte = jest.fn(() => chain);
    chain.lte = jest.fn(() => chain);
    chain.limit = jest.fn(() => Promise.resolve(overrides.selectResult ?? { data: [], error: null }));
    chain.insert = jest.fn(() => Promise.resolve(overrides.insertResult ?? { error: null }));

    return chain as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// =============================================================================
// writeLedgerEntry
// =============================================================================

describe('writeLedgerEntry', () => {
    const baseParams = {
        entryId: 'entry-001',
        desk: 'PREMARKET' as const,
        symbol: 'AAPL',
        tradeDirection: 'LONG',
        entryTimestamp: '2026-02-12T09:30:00Z',
        exitTimestamp: '2026-02-12T15:00:00Z',
        entryPrice: 150,
        exitPrice: 155,
        quantity: 100,
        realizedPnl: 500,
        rMultiple: 2.5,
        reconcileBatchId: 'batch-123',
    };

    test('inserts new row when entry_id not found', async () => {
        const supabase = mockSupabase({ selectResult: { data: [], error: null } });

        const result = await writeLedgerEntry(supabase, baseParams);

        expect(result.written).toBe(true);
        expect((supabase as unknown as Record<string, jest.Mock>).from).toHaveBeenCalledWith('trade_ledger');
        expect((supabase as unknown as Record<string, jest.Mock>).insert).toHaveBeenCalledWith(
            expect.objectContaining({
                entry_id: 'entry-001',
                desk: 'PREMARKET',
                symbol: 'AAPL',
                realized_pnl: 500,
            }),
        );
    });

    test('skips insert when entry_id already exists (idempotent)', async () => {
        const supabase = mockSupabase({
            selectResult: { data: [{ id: 'existing-row' }], error: null },
        });

        const result = await writeLedgerEntry(supabase, baseParams);

        expect(result.written).toBe(false);
        expect((supabase as unknown as Record<string, jest.Mock>).insert).not.toHaveBeenCalled();
    });

    test('throws on insert error', async () => {
        const supabase = mockSupabase({
            selectResult: { data: [], error: null },
            insertResult: { error: { message: 'permission denied' } },
        });

        await expect(writeLedgerEntry(supabase, baseParams)).rejects.toThrow('Failed to write ledger entry');
    });
});

// =============================================================================
// loadRealizedPnLForDate
// =============================================================================

describe('loadRealizedPnLForDate', () => {
    test('sums realized_pnl for all rows on date', async () => {
        const supabase = mockSupabase();
        // Override the chain to return data at the end of gte().lte()
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({
            data: [
                { realized_pnl: 250 },
                { realized_pnl: -100 },
                { realized_pnl: 500 },
            ],
            error: null,
        });

        const result = await loadRealizedPnLForDate(supabase, '2026-02-12');
        expect(result).toBe(650);
    });

    test('returns 0 for empty day', async () => {
        const supabase = mockSupabase();
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({ data: [], error: null });

        const result = await loadRealizedPnLForDate(supabase, '2026-02-12');
        expect(result).toBe(0);
    });

    test('throws on error', async () => {
        const supabase = mockSupabase();
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });

        await expect(loadRealizedPnLForDate(supabase, '2026-02-12')).rejects.toThrow('Failed to load realized PnL');
    });
});

// =============================================================================
// loadDailySummary
// =============================================================================

describe('loadDailySummary', () => {
    test('aggregates correctly with wins and losses', async () => {
        const supabase = mockSupabase();
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({
            data: [
                { symbol: 'AAPL', realized_pnl: 500, r_multiple: 2.5 },
                { symbol: 'TSLA', realized_pnl: -200, r_multiple: -1.0 },
                { symbol: 'AAPL', realized_pnl: 300, r_multiple: 1.5 },
            ],
            error: null,
        });

        const result = await loadDailySummary(supabase, '2026-02-12');

        expect(result.realizedPnl).toBe(600);
        expect(result.tradeCount).toBe(3);
        expect(result.winRate).toBeCloseTo(2 / 3);
        expect(result.avgR).toBe(1.0); // (2.5 + -1.0 + 1.5) / 3
        expect(result.symbols).toEqual(['AAPL', 'TSLA']); // sorted
    });

    test('returns zero summary for empty day', async () => {
        const supabase = mockSupabase();
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({ data: [], error: null });

        const result = await loadDailySummary(supabase, '2026-01-01');

        expect(result.realizedPnl).toBe(0);
        expect(result.tradeCount).toBe(0);
        expect(result.winRate).toBe(0);
        expect(result.avgR).toBeNull();
        expect(result.symbols).toEqual([]);
    });

    test('handles null r_multiple gracefully', async () => {
        const supabase = mockSupabase();
        const chain = supabase as unknown as Record<string, jest.Mock>;
        chain.lte.mockResolvedValueOnce({
            data: [
                { symbol: 'NVDA', realized_pnl: 1000, r_multiple: null },
            ],
            error: null,
        });

        const result = await loadDailySummary(supabase, '2026-02-12');

        expect(result.tradeCount).toBe(1);
        expect(result.avgR).toBeNull();
    });
});
