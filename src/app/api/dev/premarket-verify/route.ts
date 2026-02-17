/**
 * Premarket Verify API Route (DEV ONLY)
 *
 * GET /api/dev/premarket-verify
 * Returns PASS/FAIL for key premarket pipeline checks.
 * Disabled in production.
 */

import { NextResponse } from 'next/server';
import {
    getEffectiveProvider,
    getEffectiveBaseUrl,
    getLiveProviderDiagnostics,
    fetchPolygonSnapshot,
} from '@/lib/brains/premarket';
import type { PolygonSnapshot } from '@/lib/brains/premarket';

interface Check {
    name: string;
    pass: boolean;
    detail: string;
}

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const checks: Check[] = [];
    const diag = getLiveProviderDiagnostics();

    // (a) Provider base URL correct
    const baseUrl = getEffectiveBaseUrl();
    const urlOk = baseUrl.includes('polygon.io');
    checks.push({
        name: 'provider_base_url',
        pass: urlOk,
        detail: urlOk
            ? `Base URL is polygon.io (${baseUrl})`
            : `Base URL is NOT polygon.io: ${baseUrl}. Set MASSIVE_BASE_URL=https://api.polygon.io`,
    });

    // (b) Premarket hours detection correct
    checks.push({
        name: 'premarket_hours_detection',
        pass: diag.isPremarketHours,
        detail: diag.isPremarketHours
            ? `Currently in premarket hours (${diag.currentTimeET} ET)`
            : `NOT in premarket hours (${diag.currentTimeET} ET). Premarket is 4:00-9:30 AM ET.`,
    });

    // (c) Live price coverage >= threshold
    const sampleSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];
    const snapshots: PolygonSnapshot[] = [];
    let liveCount = 0;

    for (const symbol of sampleSymbols) {
        try {
            const snap = await fetchPolygonSnapshot(symbol);
            snapshots.push(snap);
            if (snap.livePrice !== null) liveCount++;
        } catch {
            snapshots.push({
                symbol,
                prevClose: null,
                open: null,
                lastPrice: null,
                premarketPrice: null,
                livePrice: null,
                livePriceSource: null,
                lastTradeTimestamp: null,
                dataMode: 'OPEN_FALLBACK',
            });
        }
    }

    const threshold = 1; // at least 1 of 5 sample symbols
    const coverageOk = liveCount >= threshold;
    checks.push({
        name: 'live_price_coverage',
        pass: coverageOk,
        detail: `${liveCount}/${sampleSymbols.length} symbols have livePrice (need >= ${threshold})`,
    });

    // (d) Sample snapshot details
    const snapshotSummary = snapshots.map(s => ({
        symbol: s.symbol,
        prevClose: s.prevClose,
        lastPrice: s.lastPrice,
        livePrice: s.livePrice,
        livePriceSource: s.livePriceSource,
        premarketPrice: s.premarketPrice,
        dataMode: s.dataMode,
        hasError: !!s.error,
        errorStatus: s.error?.status,
    }));

    const allPass = checks.every(c => c.pass);

    return NextResponse.json({
        overall: allPass ? 'PASS' : 'FAIL',
        checks,
        snapshots: snapshotSummary,
        provider: {
            name: getEffectiveProvider(),
            baseUrl: getEffectiveBaseUrl(),
            currentTimeET: diag.currentTimeET,
            isPremarketHours: diag.isPremarketHours,
            isMarketHours: diag.isMarketHours,
        },
        timestamp: new Date().toISOString(),
    });
}
