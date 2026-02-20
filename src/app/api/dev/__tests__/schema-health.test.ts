/**
 * Schema Health Route Tests
 *
 * Tests the /api/dev/schema-health endpoint:
 * 1. 404 when not admin
 * 2. 503 with errorCode when DB not configured
 * 3. PASS when all table probes succeed
 * 4. FAIL when at least one column probe fails
 *
 * NOTE: The schema-health route uses PostgREST probing (from().select().limit(0))
 * to check column existence. We mock the Supabase from() chain to simulate this.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheckAdminAuth = jest.fn();
jest.mock('@/lib/auth/admin-gate', () => ({
    checkAdminAuth: (req: NextRequest) => mockCheckAdminAuth(req),
}));

// Build a mock Supabase client that simulates from().select().limit().eq()
const mockFrom = jest.fn();
const mockIsConfigured = jest.fn(() => true);

jest.mock('@/lib/supabase/server', () => ({
    createServerSupabase: () => ({
        from: (...args: unknown[]) => mockFrom(...args),
    }),
    isServerSupabaseConfigured: () => mockIsConfigured(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
    return new NextRequest('http://localhost:3000/api/dev/schema-health');
}

/**
 * Create a mock from() that always succeeds (all tables/columns exist).
 * Simulates: supabase.from(table).select(cols).limit(0) → no error
 * And also: supabase.from('information_schema.columns').select().eq() → error (fallback to probing)
 */
function mockFromAllPass() {
    mockFrom.mockImplementation((table: string) => {
        if (table === 'information_schema.columns') {
            // Force fallback to probing by returning error
            return {
                select: () => ({
                    eq: () => Promise.resolve({ data: null, error: { message: 'not exposed' } }),
                }),
            };
        }
        // Regular table probing — all succeed
        return {
            select: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
            }),
        };
    });
}

/**
 * Create a mock from() where one specific table has a missing column.
 * Handles two-level probing:
 *   1. Batch probe (select("col1,col2,...").limit(0)) → fails if table matches
 *   2. Individual probe (select("singleCol").limit(0)) → fails only for exact column
 */
function mockFromWithMissing(failTable: string, failColumn: string) {
    mockFrom.mockImplementation((table: string) => {
        if (table === 'information_schema.columns') {
            return {
                select: () => ({
                    eq: () => Promise.resolve({ data: null, error: { message: 'not exposed' } }),
                }),
            };
        }

        return {
            select: (cols: string) => ({
                limit: () => {
                    if (table === failTable) {
                        // If this is the batch probe (multiple cols), fail it
                        // so the route falls through to individual column probes
                        if (cols.includes(',')) {
                            return Promise.resolve({
                                data: null,
                                error: { message: `column "${failColumn}" does not exist` },
                            });
                        }
                        // Individual column probe — fail only the missing column
                        if (cols.trim() === failColumn) {
                            return Promise.resolve({
                                data: null,
                                error: { message: `column "${failColumn}" does not exist` },
                            });
                        }
                    }
                    // All other probes succeed
                    return Promise.resolve({ data: [], error: null });
                },
            }),
        };
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/dev/schema-health', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.ADMIN_MODE = 'true';

        jest.resetModules();

        mockCheckAdminAuth.mockReturnValue({ authorized: true });
        mockIsConfigured.mockReturnValue(true);
        mockFrom.mockReset();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // -----------------------------------------------------------------------
    // 1) 404 when not admin
    // -----------------------------------------------------------------------
    it('returns 404 when not admin', async () => {
        mockCheckAdminAuth.mockReturnValue({ authorized: false });

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(404);
    });

    // -----------------------------------------------------------------------
    // 2) 503 when server DB not configured
    // -----------------------------------------------------------------------
    it('returns 503 with errorCode when server DB not configured', async () => {
        mockIsConfigured.mockReturnValue(false);

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(503);

        const body = await res.json();
        expect(body.status).toBe('ERROR');
        expect(body.errorCode).toBe('DB_NOT_CONFIGURED');
    });

    // -----------------------------------------------------------------------
    // 3) PASS when all required checks pass
    // -----------------------------------------------------------------------
    it('returns PASS when all column probes succeed', async () => {
        mockFromAllPass();

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('PASS');
        expect(body.totalChecked).toBeGreaterThan(0);
        expect(body.found).toBe(body.totalChecked);
        expect(body.missing).toEqual([]);
        expect(body.checkedAt).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 4) FAIL when at least one table/column missing
    // -----------------------------------------------------------------------
    it('returns FAIL when at least one column probe fails', async () => {
        mockFromWithMissing('trade_ledger', 'realized_pnl');

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('FAIL');
        expect(body.missing.length).toBeGreaterThan(0);
    });
});
