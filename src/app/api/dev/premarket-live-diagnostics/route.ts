/**
 * Premarket Live Diagnostics Route (DEV ONLY)
 * 
 * GET /api/dev/premarket-live-diagnostics
 * 
 * Returns 404 in production. Exposes live premarket diagnostic info
 * without leaking secrets (no API keys or headers).
 */

import { NextResponse } from 'next/server';
import {
    getPremarketUniverse,
    getDatasetRange,
    isLiveProviderConfigured,
    MIN_COVERAGE_COUNT,
    MIN_COVERAGE_PERCENT,
    getLiveProviderDiagnostics,
    fetchPolygonSnapshotDetailed,
} from '@/lib/brains/premarket';
import type { PolygonSnapshotDetailed, ProviderError } from '@/lib/brains/premarket';

export async function GET() {
    // 404 in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Not found' },
            { status: 404 }
        );
    }

    try {
        const today = new Date().toISOString().slice(0, 10);
        const universe = getPremarketUniverse();
        const datasetRange = getDatasetRange();

        // Get live provider diagnostics
        const polygonDiag = getLiveProviderDiagnostics();

        // Check provider configuration
        const liveConfigured = isLiveProviderConfigured();

        // Fetch detailed snapshots for sample symbols (showing raw field values)
        const sampleSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];
        const providerErrors: ProviderError[] = [];

        let symbolsWithPremarketPrice = 0;
        let symbolsWithPrevClose = 0;
        let symbolsWithOpen = 0;
        let symbolsWithLivePrice = 0;

        const detailedSnapshots: PolygonSnapshotDetailed[] = [];

        for (const symbol of sampleSymbols) {
            try {
                const snapshot = await fetchPolygonSnapshotDetailed(symbol);
                detailedSnapshots.push(snapshot);

                if (snapshot.rawFields.prevDayClose !== null) symbolsWithPrevClose++;
                if (snapshot.computed.premarketPrice !== null) symbolsWithPremarketPrice++;
                if (snapshot.rawFields.dayOpen !== null) symbolsWithOpen++;
                if (snapshot.computed.livePrice !== null) symbolsWithLivePrice++;

                if (snapshot.error) {
                    providerErrors.push(snapshot.error);
                }
            } catch (err) {
                detailedSnapshots.push({
                    symbol,
                    rawFields: {
                        prevDayClose: null,
                        dayOpen: null,
                        lastTradePrice: null,
                        lastTradeTimestamp: null,
                        minClose: null,
                        askPrice: null,
                        bidPrice: null,
                    },
                    computed: {
                        premarketPrice: null,
                        premarketPriceSource: 'none (FETCH_EXCEPTION)',
                        livePrice: null,
                        livePriceSource: null,
                        dataMode: 'OPEN_FALLBACK',
                        isPremarketHours: polygonDiag.isPremarketHours,
                    },
                    error: {
                        provider: polygonDiag.effectiveProvider,
                        status: 'FETCH_EXCEPTION',
                        messagePreview: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
                    },
                });
            }
        }

        // Coverage check (now uses livePrice for coverage)
        const minByPercent = Math.ceil(universe.length * MIN_COVERAGE_PERCENT);
        const coverageSufficient = symbolsWithLivePrice >= MIN_COVERAGE_COUNT
            || symbolsWithLivePrice >= minByPercent;

        return NextResponse.json({
            nodeEnv: process.env.NODE_ENV ?? 'undefined',
            asOfDate: today,

            // Provider info (no secrets)
            provider: {
                effectiveProvider: polygonDiag.effectiveProvider,
                effectiveBaseUrl: polygonDiag.effectiveBaseUrl,
                hasMassiveKey: polygonDiag.hasMassiveKey,
                hasPolygonKey: polygonDiag.hasPolygonKey,
                liveConfigured,
                isPremarketHours: polygonDiag.isPremarketHours,
                isMarketHours: polygonDiag.isMarketHours,
                currentTimeET: polygonDiag.currentTimeET,
            },

            // Dataset info
            datasetRange,

            // Coverage (sample only)
            coverage: {
                universeCount: universe.length,
                sampleCount: sampleSymbols.length,
                symbolsWithPrevClose,
                symbolsWithOpen,
                symbolsWithPremarketPrice,
                symbolsWithLivePrice,
                minCoverageCount: MIN_COVERAGE_COUNT,
                minCoveragePercent: `${MIN_COVERAGE_PERCENT * 100}%`,
                minByPercent,
                coverageSufficient,
            },

            // Detailed sample snapshots with raw field values
            detailedSnapshots,

            // Provider errors
            providerErrors,

            // Timestamp
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Premarket Live Diagnostics] Error:', error);
        return NextResponse.json(
            {
                error: 'Diagnostics failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
