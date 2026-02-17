/**
 * Schema Health API Route
 *
 * GET /api/dev/schema-health
 *
 * Verifies required tables and columns exist via the
 * dev_schema_check_required() SECURITY DEFINER RPC.
 * Uses the service-role Supabase client exclusively.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   503 — server DB not configured
 *   200 — { status: "PASS"|"FAIL", totalChecked, found, missing, checkedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import {
    isServerSupabaseConfigured,
    createServerSupabase,
} from '@/lib/supabase/server';

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    // Refuse to run when server DB is not configured
    if (!isServerSupabaseConfigured()) {
        return NextResponse.json(
            {
                status: 'ERROR',
                errorCode: 'DB_NOT_CONFIGURED',
                checkedAt: new Date().toISOString(),
            },
            { status: 503 },
        );
    }

    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase.rpc('dev_schema_check_required');

        if (error) {
            return NextResponse.json(
                {
                    status: 'FAIL',
                    error: `RPC error: ${error.message.slice(0, 200)}`,
                    checkedAt: new Date().toISOString(),
                },
                { status: 200 },
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = data as any;
        const totalChecked: number = raw?.totalChecked ?? raw?.totalchecked ?? 0;
        const found: number = raw?.found ?? 0;
        const missing: unknown[] = raw?.missing ?? [];

        // Compute status from data — resilient regardless of RPC key casing
        const status = missing.length === 0 ? 'PASS' : 'FAIL';

        return NextResponse.json({
            status,
            totalChecked,
            found,
            missing,
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        console.error('[SchemaHealth] Error:', message);
        return NextResponse.json(
            {
                status: 'FAIL',
                error: message,
                checkedAt: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
