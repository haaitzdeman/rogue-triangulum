/**
 * Dev Broker Environment API Route
 *
 * GET /api/dev/broker-env
 * Returns environment variable presence (not values) for debugging.
 *
 * DISABLED IN PRODUCTION: Returns 404 if NODE_ENV === 'production'
 */

import { NextResponse } from 'next/server';
import { isAlpacaConfigured } from '@/lib/broker/alpaca-client';

export async function GET() {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    const alpaca = isAlpacaConfigured();

    return NextResponse.json({
        hasALPACA_API_KEY: alpaca.hasApiKey,
        hasALPACA_API_SECRET: alpaca.hasApiSecret,
        effectiveBaseUrl: alpaca.effectiveBaseUrl,
    });
}
