export const dynamic = 'force-dynamic';

/**
 * GET /api/deploy-hash
 *
 * Read-only deploy-proof endpoint (fallback location).
 * Identical to /api/dev/deploy-hash — exists at top-level
 * in case /api/dev routes are treated specially.
 *
 * Safe to expose publicly — contains no secrets.
 */

import { NextResponse } from 'next/server';

const OPS_BUILD_TAG = '2026-02-24-deploy-proof-v3';

export async function GET() {
    return NextResponse.json({
        ok: true,
        commitSha:
            process.env.VERCEL_GIT_COMMIT_SHA ??
            process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
            'unknown',
        buildTimestamp: new Date().toISOString(),
        opsBuildTag: OPS_BUILD_TAG,
        seedRoutesNuclear404Enabled: true,
    });
}
