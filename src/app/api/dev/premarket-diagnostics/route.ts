/**
 * Premarket Diagnostics Route (DEV ONLY)
 * 
 * GET /api/dev/premarket-diagnostics
 * 
 * Returns 404 in production. Exposes diagnostic info without leaking secrets.
 */

import { NextResponse } from 'next/server';
import {
    getPremarketUniverse,
    getProviderDiagnostics,
    diagnoseSymbol,
} from '@/lib/brains/premarket';

export async function GET() {
    // 404 in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const scanDate = new Date();
        const dateStr = scanDate.toISOString().slice(0, 10);

        // Get provider diagnostics (no secrets)
        const providerInfo = getProviderDiagnostics();

        // Get universe
        const universe = getPremarketUniverse();
        const first10Symbols = universe.slice(0, 10);

        // Diagnose first 10 symbols
        const symbolDiagnostics = first10Symbols.map(symbol =>
            diagnoseSymbol(symbol, scanDate)
        );

        // Summary stats
        const okCount = symbolDiagnostics.filter(d => d.ok).length;
        const withPrevClose = symbolDiagnostics.filter(d => d.prevClose !== null).length;
        const withOpen = symbolDiagnostics.filter(d => d.open !== null).length;
        const withPremarket = symbolDiagnostics.filter(d => d.premarketPrice !== null).length;

        return NextResponse.json({
            nodeEnv: process.env.NODE_ENV ?? 'undefined',
            scanDate: dateStr,
            provider: providerInfo,
            universe: {
                count: universe.length,
                first10: first10Symbols,
            },
            diagnostics: {
                symbolCount: first10Symbols.length,
                okCount,
                withPrevClose,
                withOpen,
                withPremarket,
                symbols: symbolDiagnostics,
            },
        });
    } catch (error) {
        console.error('[Premarket Diagnostics] Error:', error);
        return NextResponse.json(
            {
                error: 'Diagnostics failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
