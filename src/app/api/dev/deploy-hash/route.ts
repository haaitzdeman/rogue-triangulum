export const dynamic = 'force-dynamic';

/**
 * GET /api/dev/deploy-hash
 *
 * Read-only diagnostic endpoint. Returns current build info.
 * Safe to expose publicly — contains no secrets.
 * Used to verify which commit is live in production.
 */

import { NextResponse } from 'next/server';

/** Bump this tag any time you need to force-verify a new deploy landed. */
const OPS_BUILD_TAG = '2026-02-23-seed-nuclear-v2';

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
