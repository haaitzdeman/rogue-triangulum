/**
 * Middleware: Edge routing guards.
 *
 * 1. Blocks ALL requests to /api/journal/debug/* unconditionally.
 * 2. Enforces ROUTE_MANIFEST allowlist on /api/dev/* routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ROUTE_MANIFEST } from '@/lib/auth/route-manifest';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Unconditional 404 for any debug route
    if (pathname.startsWith('/api/journal/debug/')) {
        return new NextResponse(null, { status: 404 });
    }

    // 2. Dev Route Allowlist Gate
    if (pathname.startsWith('/api/dev/')) {
        // Normalize path: strip trailing slash
        const normalizedPath = pathname.endsWith('/') && pathname.length > 1
            ? pathname.slice(0, -1)
            : pathname;

        const devRoutes = ROUTE_MANIFEST.dev || [];

        if (devRoutes.includes(normalizedPath)) {
            const res = NextResponse.next();
            res.headers.set('x-route-gate', 'allowed');
            return res;
        }

        // Block unlisted dev routes
        const blockedRes = new NextResponse(null, { status: 404 });
        blockedRes.headers.set('x-route-gate', 'blocked');
        blockedRes.headers.set('x-route-gate-reason', 'Path not in DEV allowlist manifest');
        return blockedRes;
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/journal/debug/:path*', '/api/dev/:path*'],
};
