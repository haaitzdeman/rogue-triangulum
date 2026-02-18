export const dynamic = 'force-dynamic';

/**
 * Broker Health API Route
 *
 * GET /api/dev/broker-health
 *
 * Admin-gated. Calls Alpaca /v2/account to verify connectivity.
 * Returns safe fields only (id, status, currency) — no secrets.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   200 — { status: "PASS"|"FAIL", account?, baseUrl?, error? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isAlpacaConfigured, getAccount } from '@/lib/broker/alpaca-client';

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    // Check if keys are configured at all
    const config = isAlpacaConfigured();

    if (!config.hasApiKey || !config.hasApiSecret) {
        return NextResponse.json({
            status: 'FAIL',
            error: 'ALPACA_API_KEY and/or ALPACA_API_SECRET not set',
            baseUrl: config.effectiveBaseUrl,
            checkedAt: new Date().toISOString(),
        });
    }

    try {
        // Lightweight connectivity check — GET /v2/account
        const account = await getAccount();

        return NextResponse.json({
            status: 'PASS',
            account,
            baseUrl: config.effectiveBaseUrl,
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        return NextResponse.json({
            status: 'FAIL',
            error: message,
            baseUrl: config.effectiveBaseUrl,
            checkedAt: new Date().toISOString(),
        });
    }
}
