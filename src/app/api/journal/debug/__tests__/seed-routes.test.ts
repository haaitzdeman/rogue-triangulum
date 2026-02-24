/**
 * Tests: deploy-hash endpoints + seed routes + middleware guard
 *
 * Validates:
 *   1. GET /api/dev/deploy-hash → 200 with expected fields
 *   2. GET /api/deploy-hash (fallback) → 200 with same fields
 *   3. POST /api/journal/debug/seed → always 404
 *   4. POST /api/journal/debug/seed-drift → always 404
 *   5. Middleware blocks all /api/journal/debug/* → 404
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Deploy-Hash Endpoint Tests ──────────────────────────────────────────────

const EXPECTED_TAG = '2026-02-24-deploy-proof-v3';

describe('GET /api/dev/deploy-hash', () => {
    let GET: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/dev/deploy-hash/route');
        GET = mod.GET;
    });

    it('returns 200 with expected fields', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.opsBuildTag).toBe(EXPECTED_TAG);
        expect(body.seedRoutesNuclear404Enabled).toBe(true);
        expect(body.commitSha).toBeDefined();
        expect(body.buildTimestamp).toBeDefined();
    });
});

describe('GET /api/deploy-hash (fallback)', () => {
    let GET: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/deploy-hash/route');
        GET = mod.GET;
    });

    it('returns 200 with same expected fields', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.opsBuildTag).toBe(EXPECTED_TAG);
        expect(body.seedRoutesNuclear404Enabled).toBe(true);
        expect(body.commitSha).toBeDefined();
        expect(body.buildTimestamp).toBeDefined();
    });
});

// ─── Seed Route Tests ────────────────────────────────────────────────────────

describe('debug/seed route (nuclear disabled)', () => {
    let POST: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/journal/debug/seed/route');
        POST = mod.POST;
    });

    it('always returns 404', async () => {
        const res = await POST();
        expect(res.status).toBe(404);
    });
});

describe('debug/seed-drift route (nuclear disabled)', () => {
    let POST: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/journal/debug/seed-drift/route');
        POST = mod.POST;
    });

    it('always returns 404', async () => {
        const res = await POST();
        expect(res.status).toBe(404);
    });
});

// ─── Middleware Guard Tests ──────────────────────────────────────────────────

describe('debug route middleware guard', () => {
    let middleware: (req: NextRequest) => NextResponse;

    beforeAll(async () => {
        const mod = await import('@/middleware');
        middleware = mod.middleware;
    });

    it('returns 404 for /api/journal/debug/seed', () => {
        const req = new NextRequest('http://localhost/api/journal/debug/seed', {
            method: 'POST',
        });
        const res = middleware(req);
        expect(res.status).toBe(404);
    });

    it('returns 404 for any nested debug path', () => {
        const req = new NextRequest(
            'http://localhost/api/journal/debug/anything/else',
            { method: 'GET' },
        );
        const res = middleware(req);
        expect(res.status).toBe(404);
    });

    it('exports matcher config for debug paths only', async () => {
        const mod = await import('@/middleware');
        expect(mod.config.matcher).toBe('/api/journal/debug/:path*');
    });
});
