/**
 * Tests: build-info endpoints, seed routes, canary headers, and middleware guard
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Build Tag Sentinel ──────────────────────────────────────────────────────

describe('build-tag sentinel', () => {
    it('exports OPS_BUILD_TAG string', async () => {
        const mod = await import('@/lib/ops/build-tag');
        expect(typeof mod.OPS_BUILD_TAG).toBe('string');
        expect(mod.OPS_BUILD_TAG.length).toBeGreaterThan(0);
    });
});

// ─── GET /api/build-info (public, top-level) ─────────────────────────────────

describe('GET /api/build-info', () => {
    let GET: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/build-info/route');
        GET = mod.GET;
    });

    it('returns 200 with expected fields', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.opsBuildTag).toBeDefined();
        expect(body.seedRoutesNuclear404Enabled).toBe(true);
        expect(body.commitSha).toBeDefined();
        expect(body.serverTimestamp).toBeDefined();
    });
});

// ─── GET /api/dev/deploy-hash ────────────────────────────────────────────────

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
        expect(body.opsBuildTag).toBeDefined();
        expect(body.seedRoutesNuclear404Enabled).toBe(true);
    });
});

// ─── GET /api/deploy-hash (fallback) ─────────────────────────────────────────

describe('GET /api/deploy-hash (fallback)', () => {
    let GET: () => Promise<Response>;

    beforeAll(async () => {
        const mod = await import('@/app/api/deploy-hash/route');
        GET = mod.GET;
    });

    it('returns 200 with expected fields', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.opsBuildTag).toBeDefined();
        expect(body.seedRoutesNuclear404Enabled).toBe(true);
    });
});

// ─── Seed Route Tests ────────────────────────────────────────────────────────

describe('debug/seed route (nuclear disabled)', () => {
    it('always returns 404', async () => {
        const { POST } = await import('@/app/api/journal/debug/seed/route');
        const res = await POST();
        expect(res.status).toBe(404);
    });
});

describe('debug/seed-drift route (nuclear disabled)', () => {
    it('always returns 404', async () => {
        const { POST } = await import(
            '@/app/api/journal/debug/seed-drift/route'
        );
        const res = await POST();
        expect(res.status).toBe(404);
    });
});

// ─── Middleware Guard ────────────────────────────────────────────────────────

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
        expect(middleware(req).status).toBe(404);
    });

    it('exports matcher config', async () => {
        const mod = await import('@/middleware');
        expect(mod.config.matcher).toEqual(['/api/journal/debug/:path*', '/api/dev/:path*']);
    });
});
