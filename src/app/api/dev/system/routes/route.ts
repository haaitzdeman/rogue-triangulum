export const dynamic = 'force-dynamic';

/**
 * System Route Manifest API
 *
 * GET /api/dev/system/routes
 *
 * Admin-gated. Returns a static manifest of all user-facing app routes
 * grouped by domain. No filesystem scanning — hardcoded list only.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   200 — { routes: {...}, generatedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';

const ROUTE_MANIFEST: Record<string, string[]> = {
    today: ['/today'],
    premarket: ['/premarket/journal', '/premarket/history'],
    options: ['/options', '/options/history'],
    accounting: [],
    dev: [],
};

export async function GET(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    return NextResponse.json({
        routes: ROUTE_MANIFEST,
        totalRoutes: Object.values(ROUTE_MANIFEST).flat().length,
        generatedAt: new Date().toISOString(),
    });
}
