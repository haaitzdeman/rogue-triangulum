export const dynamic = 'force-dynamic';

/**
 * GET /api/build-info
 *
 * Public-safe deploy proof endpoint (NOT admin-gated, NOT under /api/dev).
 * Returns build tag, commit SHA, and timestamp.
 * Contains no secrets — safe to expose.
 */

import { NextResponse } from 'next/server';
import { OPS_BUILD_TAG, OPS_BUILD_TIMESTAMP } from '@/lib/ops/build-tag';

export async function GET() {
    return NextResponse.json({
        ok: true,
        opsBuildTag: OPS_BUILD_TAG,
        opsBuildTimestamp: OPS_BUILD_TIMESTAMP,
        commitSha:
            process.env.VERCEL_GIT_COMMIT_SHA ??
            process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
            'unknown',
        serverTimestamp: new Date().toISOString(),
        seedRoutesNuclear404Enabled: true,
    });
}
