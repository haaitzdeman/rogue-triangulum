/**
 * Middleware: blocks ALL requests to /api/journal/debug/* with 404.
 *
 * Belt-and-suspenders guard — even if individual route files
 * are stale or misconfigured, this middleware fires first.
 * Only matches /api/journal/debug paths; all other routes pass through.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(_request: NextRequest) {
    // Unconditional 404 for any debug route
    return new NextResponse(null, { status: 404 });
}

export const config = {
    matcher: '/api/journal/debug/:path*',
};
