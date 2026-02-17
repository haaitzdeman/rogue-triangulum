/**
 * Morning Run Store — Unit Tests
 *
 * Tests saveMorningRun (upsert), loadMorningRunByRunId, listMorningRunsByDate,
 * purgeMorningRunsBefore using a mock Supabase client.
 */

import {
    saveMorningRun,
    loadMorningRunByRunId,
    listMorningRunsByDate,
    purgeMorningRunsBefore,
} from '../morning-run-store';

// =============================================================================
// Mock Supabase client builder
// =============================================================================

function mockSupabase(overrides: {
    upsertResult?: { error: null | { message: string } };
    selectSingleResult?: { data: unknown; error: null | { code?: string; message: string } };
    selectListResult?: { data: unknown[]; error: null | { message: string } };
    deleteResult?: { data: unknown[]; error: null | { message: string } };
} = {}) {
    const chain: Record<string, jest.Mock> = {};

    // Fluent chain methods
    chain.from = jest.fn(() => chain);
    chain.upsert = jest.fn(() => Promise.resolve(overrides.upsertResult ?? { error: null }));
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.lt = jest.fn(() => chain);
    chain.order = jest.fn(() => chain);
    chain.limit = jest.fn(() => Promise.resolve(overrides.selectListResult ?? { data: [], error: null }));
    chain.single = jest.fn(() => Promise.resolve(overrides.selectSingleResult ?? { data: null, error: { code: 'PGRST116', message: 'not found' } }));
    chain.delete = jest.fn(() => chain);

    // When delete().lt().select() is called, resolve via select
    // Override select to return deleteResult when it follows delete
    let isDelete = false;
    chain.delete = jest.fn(() => { isDelete = true; return chain; });
    const origSelect = chain.select;
    chain.select = jest.fn((...args: unknown[]) => {
        if (isDelete) {
            isDelete = false;
            return Promise.resolve(overrides.deleteResult ?? { data: [], error: null });
        }
        origSelect(...args);
        return chain;
    });

    return chain as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// =============================================================================
// Tests
// =============================================================================

describe('saveMorningRun', () => {
    test('upserts row without error', async () => {
        const supabase = mockSupabase();

        await saveMorningRun({
            supabase,
            runId: 'run-abc123',
            runDate: '2026-02-12',
            generatedAt: '2026-02-12T09:00:00Z',
            meta: {
                preferLive: false,
                force: true,
                maxSymbols: 12,
                autoJournal: false,
                riskBlocked: false,
            },
            payload: { success: true, date: '2026-02-12' },
        });

        expect((supabase as unknown as Record<string, jest.Mock>).from).toHaveBeenCalledWith('morning_run_runs');
        expect((supabase as unknown as Record<string, jest.Mock>).upsert).toHaveBeenCalledWith(
            expect.objectContaining({ run_id: 'run-abc123', run_date: '2026-02-12' }),
            { onConflict: 'run_id' },
        );
    });

    test('throws on DB error', async () => {
        const supabase = mockSupabase({ upsertResult: { error: { message: 'DB down' } } });

        await expect(saveMorningRun({
            supabase,
            runId: 'run-fail',
            runDate: '2026-02-12',
            generatedAt: '2026-02-12T09:00:00Z',
            meta: { preferLive: false, force: false, maxSymbols: 12, autoJournal: false, riskBlocked: false },
            payload: {},
        })).rejects.toThrow('Failed to save morning run');
    });
});

describe('loadMorningRunByRunId', () => {
    test('returns payload when found', async () => {
        const supabase = mockSupabase({
            selectSingleResult: {
                data: { payload: { success: true, runId: 'run-xyz' }, run_date: '2026-02-12' },
                error: null,
            },
        });

        const result = await loadMorningRunByRunId(supabase, 'run-xyz');
        expect(result).toEqual({ payload: { success: true, runId: 'run-xyz' }, runDate: '2026-02-12' });
    });

    test('returns null when not found (PGRST116)', async () => {
        const supabase = mockSupabase(); // default = PGRST116

        const result = await loadMorningRunByRunId(supabase, 'run-missing');
        expect(result).toBeNull();
    });

    test('throws on real DB error', async () => {
        const supabase = mockSupabase({
            selectSingleResult: { data: null, error: { code: '42P01', message: 'table not found' } },
        });

        await expect(loadMorningRunByRunId(supabase, 'run-err')).rejects.toThrow('Failed to load morning run');
    });
});

describe('listMorningRunsByDate', () => {
    test('returns mapped summaries sorted by generated_at', async () => {
        const supabase = mockSupabase({
            selectListResult: {
                data: [
                    {
                        run_id: 'run-b',
                        run_date: '2026-02-12',
                        generated_at: '2026-02-12T10:00:00Z',
                        risk_blocked: false,
                        auto_journal: true,
                        payload: {
                            premarket: { candidateCount: 5 },
                            options: { completed: 3 },
                            today: { opportunityCount: 2 },
                        },
                    },
                    {
                        run_id: 'run-a',
                        run_date: '2026-02-12',
                        generated_at: '2026-02-12T09:00:00Z',
                        risk_blocked: true,
                        auto_journal: false,
                        payload: {
                            premarket: { candidateCount: 4 },
                            options: { completed: 2 },
                            today: { opportunityCount: 1 },
                        },
                    },
                ],
                error: null,
            },
        });

        const results = await listMorningRunsByDate(supabase, '2026-02-12');
        expect(results).toHaveLength(2);
        expect(results[0].runId).toBe('run-b');
        expect(results[0].candidateCount).toBe(5);
        expect(results[1].runId).toBe('run-a');
        expect(results[1].riskBlocked).toBe(true);
    });

    test('returns empty array for no data', async () => {
        const supabase = mockSupabase({ selectListResult: { data: [], error: null } });
        const results = await listMorningRunsByDate(supabase, '2026-01-01');
        expect(results).toEqual([]);
    });
});

describe('purgeMorningRunsBefore', () => {
    test('returns count of deleted rows', async () => {
        const supabase = mockSupabase({
            deleteResult: { data: [{ id: '1' }, { id: '2' }], error: null },
        });

        const count = await purgeMorningRunsBefore(supabase, '2026-01-01');
        expect(count).toBe(2);
    });

    test('throws on error', async () => {
        const supabase = mockSupabase({
            deleteResult: { data: [], error: { message: 'permission denied' } },
        });

        await expect(purgeMorningRunsBefore(supabase, '2026-01-01')).rejects.toThrow('Failed to purge');
    });
});
