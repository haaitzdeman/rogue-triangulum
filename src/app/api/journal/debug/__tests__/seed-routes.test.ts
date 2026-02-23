/**
 * Tests for debug seed routes
 *
 * Validates:
 *   - Kill switch (DEBUG_SEED_ROUTES_ENABLED) blocks routes by default → 404
 *   - Admin gate blocks without token when flag enabled → 404
 *   - With both flag + token, route executes → 200 (no fs writes in test)
 */

import { NextRequest } from 'next/server';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock checkAdminAuth
const mockCheckAdminAuth = jest.fn();
jest.mock('@/lib/auth/admin-gate', () => ({
    checkAdminAuth: (req: NextRequest) => mockCheckAdminAuth(req),
}));

// Mock signal-store (prevent any fs usage)
jest.mock('@/lib/journal/signal-store', () => ({
    addSignals: jest.fn().mockReturnValue({ added: 2, skipped: 0 }),
    addOutcome: jest.fn().mockReturnValue(true),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(token?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (token) headers['x-admin-token'] = token;
    return new NextRequest('http://localhost/api/journal/debug/seed', {
        method: 'POST',
        headers,
    });
}

// ─── Seed Route Tests ────────────────────────────────────────────────────────

describe('debug/seed route', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeAll(async () => {
        const mod = await import(
            '@/app/api/journal/debug/seed/route'
        );
        POST = mod.POST;
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.DEBUG_SEED_ROUTES_ENABLED;
    });

    it('returns 404 when DEBUG_SEED_ROUTES_ENABLED is not set', async () => {
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        // checkAdminAuth should never be called
        expect(mockCheckAdminAuth).not.toHaveBeenCalled();
    });

    it('returns 404 when kill switch is OFF even with valid token', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'false';
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        expect(mockCheckAdminAuth).not.toHaveBeenCalled();
    });

    it('returns 404 when flag enabled but no admin token', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        mockCheckAdminAuth.mockReturnValue({ authorized: false });
        const res = await POST(makeReq());
        expect(res.status).toBe(404);
        expect(mockCheckAdminAuth).toHaveBeenCalled();
    });

    it('returns 200 when flag enabled AND admin token valid', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        mockCheckAdminAuth.mockReturnValue({ authorized: true });
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.added).toBe(2);
    });
});

// ─── Seed-Drift Route Tests ─────────────────────────────────────────────────

describe('debug/seed-drift route', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeAll(async () => {
        const mod = await import(
            '@/app/api/journal/debug/seed-drift/route'
        );
        POST = mod.POST;
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.DEBUG_SEED_ROUTES_ENABLED;
    });

    it('returns 404 when DEBUG_SEED_ROUTES_ENABLED is not set', async () => {
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        expect(mockCheckAdminAuth).not.toHaveBeenCalled();
    });

    it('returns 404 when kill switch is OFF even with valid token', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'false';
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        expect(mockCheckAdminAuth).not.toHaveBeenCalled();
    });

    it('returns 404 when flag enabled but no admin token', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        mockCheckAdminAuth.mockReturnValue({ authorized: false });
        const res = await POST(makeReq());
        expect(res.status).toBe(404);
        expect(mockCheckAdminAuth).toHaveBeenCalled();
    });

    it('returns 200 when flag enabled AND admin token valid', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        mockCheckAdminAuth.mockReturnValue({ authorized: true });
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.signalsAdded).toBeDefined();
    });
});
