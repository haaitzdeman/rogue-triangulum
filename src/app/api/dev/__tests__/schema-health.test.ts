/**
 * Schema Health Route Tests
 *
 * Tests the /api/dev/schema-health endpoint:
 * 1. 404 when not admin
 * 2. 503 with errorCode when DB not configured
 * 3. PASS when RPC returns PASS
 * 4. FAIL when RPC returns FAIL with missing list
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheckAdminAuth = jest.fn();
jest.mock('@/lib/auth/admin-gate', () => ({
    checkAdminAuth: (req: NextRequest) => mockCheckAdminAuth(req),
}));

const mockRpc = jest.fn();
const mockCreateServerSupabase = jest.fn(() => ({ rpc: mockRpc }));
const mockIsConfigured = jest.fn(() => true);

jest.mock('@/lib/supabase/server', () => ({
    createServerSupabase: () => mockCreateServerSupabase(),
    isServerSupabaseConfigured: () => mockIsConfigured(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
    return new NextRequest('http://localhost:3000/api/dev/schema-health');
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
        mockRpc.mockReset();
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
    it('returns PASS when all required checks pass', async () => {
        mockRpc.mockResolvedValue({
            data: {
                status: 'PASS',
                totalChecked: 43,
                found: 43,
                missing: [],
            },
            error: null,
        });

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('PASS');
        expect(body.totalChecked).toBe(43);
        expect(body.found).toBe(43);
        expect(body.missing).toEqual([]);
        expect(body.checkedAt).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 4) FAIL when at least one table/column missing
    // -----------------------------------------------------------------------
    it('returns FAIL when at least one table/column missing', async () => {
        mockRpc.mockResolvedValue({
            data: {
                status: 'FAIL',
                totalChecked: 43,
                found: 42,
                missing: [{ table: 'trade_ledger', column: 'exit_timestamp' }],
            },
            error: null,
        });

        const { GET } = await import('../schema-health/route');
        const res = await GET(makeRequest());

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.status).toBe('FAIL');
        expect(body.totalChecked).toBe(43);
        expect(body.found).toBe(42);
        expect(body.missing).toEqual([
            { table: 'trade_ledger', column: 'exit_timestamp' },
        ]);
    });
});
