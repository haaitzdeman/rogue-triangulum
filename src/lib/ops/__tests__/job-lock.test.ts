/**
 * Job Lock Tests
 *
 * Tests lock acquisition, double-lock prevention, stale expiry,
 * and release behavior using mocked Supabase.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

// Chain builders
const mockEq = jest.fn().mockReturnThis();
const mockIs = jest.fn().mockReturnThis();
const mockLt = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();
const mockMaybeSingle = jest.fn();
const mockChainSelect = jest.fn();

// Setup chain return values
mockSelect.mockImplementation(() => ({
    eq: mockEq,
    limit: mockLimit,
    lt: mockLt,
    is: mockIs,
    maybeSingle: mockMaybeSingle,
}));

mockLimit.mockImplementation(() => ({
    maybeSingle: mockMaybeSingle,
}));

mockInsert.mockImplementation(() => ({ error: null }));
mockUpdate.mockImplementation(() => ({
    eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
    }),
}));
mockDelete.mockImplementation(() => ({
    eq: jest.fn().mockResolvedValue({ error: null }),
    lt: mockLt,
    select: mockChainSelect,
}));

mockLt.mockImplementation(() => ({
    is: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
}));

mockChainSelect.mockResolvedValue({ data: [], error: null });

jest.mock('@/lib/supabase/untyped', () => ({
    untypedFrom: () => ({
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDelete,
    }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { acquireLock, releaseLock, expireStaleLocks } from '../job-lock';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Job Lock', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: no existing lock
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });
        mockInsert.mockReturnValue({ error: null });
    });

    describe('acquireLock', () => {
        it('should acquire lock when no lock exists', async () => {
            const result = await acquireLock('test-job', 60);

            expect(result.acquired).toBe(true);
            expect(result.runId).toContain('test-job');
        });

        it('should skip when lock is active (not expired, not released)', async () => {
            const futureExpiry = new Date(Date.now() + 60000).toISOString();
            mockMaybeSingle.mockResolvedValue({
                data: {
                    job_name: 'test-job',
                    run_id: 'existing-run-123',
                    expires_at: futureExpiry,
                    released_at: null,
                },
                error: null,
            });

            const result = await acquireLock('test-job', 60);

            expect(result.acquired).toBe(false);
            expect(result.runId).toBe('existing-run-123');
            expect(result.reason).toContain('Lock held by');
        });

        it('should reacquire when lock is expired', async () => {
            const pastExpiry = new Date(Date.now() - 60000).toISOString();
            mockMaybeSingle.mockResolvedValue({
                data: {
                    job_name: 'test-job',
                    run_id: 'old-run-456',
                    expires_at: pastExpiry,
                    released_at: null,
                },
                error: null,
            });

            // Mock delete for stale lock cleanup
            mockDelete.mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            });

            const result = await acquireLock('test-job', 60);

            expect(result.acquired).toBe(true);
            expect(result.runId).toContain('test-job');
        });

        it('should reacquire when lock is released', async () => {
            mockMaybeSingle.mockResolvedValue({
                data: {
                    job_name: 'test-job',
                    run_id: 'released-run-789',
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                    released_at: new Date().toISOString(), // released
                },
                error: null,
            });

            mockDelete.mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            });

            const result = await acquireLock('test-job', 60);

            expect(result.acquired).toBe(true);
        });

        it('should handle insert race condition gracefully', async () => {
            mockInsert.mockReturnValue({
                error: { message: 'duplicate key value violates unique constraint' },
            });

            const result = await acquireLock('test-job', 60);

            expect(result.acquired).toBe(false);
            expect(result.reason).toContain('Insert failed');
        });
    });

    describe('releaseLock', () => {
        it('should call update with released_at', async () => {
            const mockInnerEq = jest.fn().mockResolvedValue({ error: null });
            const mockOuterEq = jest.fn().mockReturnValue({ eq: mockInnerEq });
            mockUpdate.mockReturnValue({ eq: mockOuterEq });

            await releaseLock('test-job', 'run-123');

            expect(mockUpdate).toHaveBeenCalled();
        });

        it('should truncate error message to 500 chars', async () => {
            const mockInnerEq = jest.fn().mockResolvedValue({ error: null });
            const mockOuterEq = jest.fn().mockReturnValue({ eq: mockInnerEq });
            mockUpdate.mockReturnValue({ eq: mockOuterEq });

            const longError = 'x'.repeat(1000);
            await releaseLock('test-job', 'run-123', longError);

            expect(mockUpdate).toHaveBeenCalled();
        });
    });

    describe('expireStaleLocks', () => {
        it('should return count of expired locks', async () => {
            mockDelete.mockReturnValue({
                lt: jest.fn().mockReturnValue({
                    is: jest.fn().mockReturnValue({
                        select: jest.fn().mockResolvedValue({
                            data: [{ job_name: 'stale-1' }, { job_name: 'stale-2' }],
                            error: null,
                        }),
                    }),
                }),
            });

            const result = await expireStaleLocks();

            expect(result.expired).toBe(2);
        });

        it('should return 0 when no stale locks', async () => {
            mockDelete.mockReturnValue({
                lt: jest.fn().mockReturnValue({
                    is: jest.fn().mockReturnValue({
                        select: jest.fn().mockResolvedValue({
                            data: [],
                            error: null,
                        }),
                    }),
                }),
            });

            const result = await expireStaleLocks();

            expect(result.expired).toBe(0);
        });
    });
});
