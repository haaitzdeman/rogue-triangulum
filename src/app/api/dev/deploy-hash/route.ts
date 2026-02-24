export const dynamic = 'force-dynamic';

/**
 * GET /api/dev/deploy-hash
 *
 * Read-only diagnostic endpoint. Returns current build info.
 * Safe to expose publicly — contains no secrets.
 * Used to verify which commit is live in production.
 */

import { NextResponse } from 'next/server';
import { OPS_BUILD_TAG } from '@/lib/ops/build-tag';

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
