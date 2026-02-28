import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

// Mock NextResponse for testing
jest.mock('next/server', () => {
    class MockHeaders {
        private headers = new Map<string, string>();
        set(key: string, value: string) { this.headers.set(key, value); }
        get(key: string) { return this.headers.get(key) || null; }
    }

    class MockNextResponse {
        public headers = new MockHeaders();
        public status: number;
        constructor(body: unknown, init?: { status?: number }) {
            this.status = init?.status || 200;
        }
        static next() {
            return new MockNextResponse(null);
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }

    return {
        NextResponse: MockNextResponse
    };
});

describe('Middleware DEV Gate and Normalization', () => {
    const runMiddleware = (pathname: string) => {
        const req = {
            nextUrl: { pathname }
        } as unknown as NextRequest;
        return middleware(req) as unknown as { status: number, headers: { get: (k: string) => string | null } };
    };

    it('returns unconditional 404 for journal/debug routes', () => {
        const res = runMiddleware('/api/journal/debug/seed-drift');
        expect(res.status).toBe(404);
    });

    it('blocks unlisted /api/dev/ routes and sets x-route-gate header', () => {
        const res = runMiddleware('/api/dev/foo/bar/unlisted');
        expect(res.status).toBe(404);
        expect(res.headers.get('x-route-gate')).toBe('blocked');
        expect(res.headers.get('x-route-gate-reason')).toContain('allowlist manifest');
    });

    it('allows standard Phase 3 DEV route', () => {
        const res = runMiddleware('/api/dev/ops/next-action');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-route-gate')).toBe('allowed');
    });

    it('allows standard DEV route ops/status', () => {
        const res = runMiddleware('/api/dev/ops/status');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-route-gate')).toBe('allowed');
    });

    it('normalizes trailing slash discrepancy for allowlisted route', () => {
        const res = runMiddleware('/api/dev/smoke/guided-first-trade/');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-route-gate')).toBe('allowed');
    });

    it('allows non-dev routes to pass through', () => {
        const res = runMiddleware('/api/build-info');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-route-gate')).toBeNull(); // passes via next() untouched
    });
});
