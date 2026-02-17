/**
 * Dev Provider Health API Route
 * 
 * GET /api/dev/provider-health
 * Returns health status for each configured provider.
 * 
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { checkProviderHealth } from '@/lib/agent/agent-runner';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const health = await checkProviderHealth();

        return NextResponse.json({
            providers: health,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
