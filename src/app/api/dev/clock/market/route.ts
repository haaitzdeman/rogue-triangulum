export const dynamic = 'force-dynamic';

/**
 * Market Clock API
 *
 * GET /api/dev/clock/market
 *
 * Admin-gated. Returns current NYSE market hours state.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   200 — MarketClock object
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getMarketClock } from '@/lib/market/market-hours';

export async function GET(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const clock = getMarketClock();

    return NextResponse.json(clock);
}
