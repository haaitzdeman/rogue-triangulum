export const dynamic = 'force-dynamic';

/**
 * Dev Rules API Route
 * 
 * GET /api/dev/rules
 * Returns metadata about loaded rules (not the full text).
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { getRulesMetadata } from '@/lib/agent/rules-loader';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const metadata = getRulesMetadata();

        return NextResponse.json({
            ruleCount: metadata.ruleCount,
            rules: metadata.rules,
            bundleSha256: metadata.bundleSha256,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
