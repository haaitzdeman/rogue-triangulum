export const dynamic = 'force-dynamic';

/**
 * POST /api/journal/debug/seed-drift
 *
 * Seeds evaluated signals for drift calculation — dev/local testing only.
 * PERMANENTLY DISABLED on deployed infrastructure — returns 404.
 *
 * To use locally: set DEBUG_SEED_ROUTES_ENABLED=true in .env.local
 * and provide x-admin-token header.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest) {
    // ── DISABLED: these routes only work in local dev ─────────────────────
    // The signal-store uses Node.js fs which crashes on serverless.
    // Even with lazy import, env var guards are unreliable on Vercel
    // (ADMIN_MODE=true bypasses admin gate, DEBUG_SEED_ROUTES_ENABLED
    // may be set, and NODE_ENV/VERCEL checks don't fire as expected).
    //
    // To re-enable for local dev, uncomment the block below.
    return new NextResponse(null, { status: 404 });

    /*
    // ── LOCAL DEV ONLY ───────────────────────────────────────────────────
    // Uncomment this block and comment out the return above to use locally.

    import { checkAdminAuth } from '@/lib/auth/admin-gate';
    import type { SignalRecord, SignalOutcome } from '@/lib/journal/signal-types';

    if (process.env.DEBUG_SEED_ROUTES_ENABLED !== 'true') {
        return new NextResponse(null, { status: 404 });
    }

    const auth = checkAdminAuth(_request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const { addSignals, addOutcome } = await import('@/lib/journal/signal-store');
    // ... seed-drift logic ...
    */
}
