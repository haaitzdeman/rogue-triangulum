/**
 * Risk Loader Tests
 *
 * Verifies:
 * 1. Merges premarket + options entries correctly
 * 2. Tags entries with desk
 * 3. Normalizes symbols to uppercase
 * 4. Throws on DB errors (fail-closed support)
 */

import { loadRiskEntriesForDate } from '../risk-loader';

// ── Mock Supabase client ─────────────────────────────────────────────────

function makeMockSupabase(opts: {
    premarketData?: Record<string, unknown>[];
    premarketError?: { message: string } | null;
    optionsData?: Record<string, unknown>[];
    optionsError?: { message: string } | null;
}) {
    return {
        from: (table: string) => {
            if (table === 'premarket_journal_entries') {
                return {
                    select: () => ({
                        eq: () => Promise.resolve({
                            data: opts.premarketData ?? [],
                            error: opts.premarketError ?? null,
                        }),
                    }),
                };
            }
            if (table === 'options_journal_entries') {
                return {
                    select: () => ({
                        gte: () => Promise.resolve({
                            data: opts.optionsData ?? [],
                            error: opts.optionsError ?? null,
                        }),
                    }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        },
    };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('loadRiskEntriesForDate', () => {
    test('merges premarket + options entries', async () => {
        const db = makeMockSupabase({
            premarketData: [
                { id: 'pm-1', symbol: 'aapl', status: 'ENTERED', entry_price: 150, exit_price: null, size: 10, total_qty: null, realized_pnl_dollars: null, trade_direction: 'LONG' },
            ],
            optionsData: [
                { id: 'opt-1', symbol: 'tsla', status: 'OPEN', realized_pnl_dollars: -50 },
            ],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries = await loadRiskEntriesForDate(db as any, '2026-02-11');
        expect(entries).toHaveLength(2);

        // Premarket entry
        const pm = entries.find(e => e.id === 'pm-1')!;
        expect(pm.desk).toBe('PREMARKET');
        expect(pm.symbol).toBe('AAPL'); // uppercased

        // Options entry
        const opt = entries.find(e => e.id === 'opt-1')!;
        expect(opt.desk).toBe('OPTIONS');
        expect(opt.symbol).toBe('TSLA'); // uppercased
    });

    test('returns empty array when both tables empty', async () => {
        const db = makeMockSupabase({});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries = await loadRiskEntriesForDate(db as any, '2026-02-11');
        expect(entries).toHaveLength(0);
    });

    test('throws on premarket DB error', async () => {
        const db = makeMockSupabase({
            premarketError: { message: 'permission denied' },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(loadRiskEntriesForDate(db as any, '2026-02-11'))
            .rejects.toThrow('premarket read failed');
    });

    test('throws on options DB error', async () => {
        const db = makeMockSupabase({
            optionsError: { message: 'timeout' },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expect(loadRiskEntriesForDate(db as any, '2026-02-11'))
            .rejects.toThrow('options read failed');
    });
});
