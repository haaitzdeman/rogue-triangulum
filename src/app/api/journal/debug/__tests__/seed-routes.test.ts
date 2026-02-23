/**
 * Tests for debug seed routes — NUCLEAR DISABLED.
 *
 * Both routes unconditionally return 404 in all environments.
 * This is the permanent production state — these routes serve no
 * purpose on deployed infrastructure (they use Node.js fs which
 * crashes on serverless).
 */

import { NextRequest } from 'next/server';

function makeReq(token?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (token) headers['x-admin-token'] = token;
    return new NextRequest('http://localhost/api/journal/debug/seed', {
        method: 'POST',
        headers,
    });
}

describe('debug/seed route (disabled)', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/journal/debug/seed/route');
        POST = mod.POST;
    });

    it('always returns 404 regardless of flags or tokens', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        delete process.env.DEBUG_SEED_ROUTES_ENABLED;
    });

    it('returns 404 with no token', async () => {
        const res = await POST(makeReq());
        expect(res.status).toBe(404);
    });
});

describe('debug/seed-drift route (disabled)', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/journal/debug/seed-drift/route');
        POST = mod.POST;
    });

    it('always returns 404 regardless of flags or tokens', async () => {
        process.env.DEBUG_SEED_ROUTES_ENABLED = 'true';
        const res = await POST(makeReq('valid-token'));
        expect(res.status).toBe(404);
        delete process.env.DEBUG_SEED_ROUTES_ENABLED;
    });

    it('returns 404 with no token', async () => {
        const res = await POST(makeReq());
        expect(res.status).toBe(404);
    });
});
