/**
 * Options Scan API Route
 *
 * GET /api/options/scan?symbol=AAPL&force=true
 *
 * Returns structured options scan result including:
 * - Underlying price
 * - IV rank
 * - Expected move
 * - Strategy suggestion
 * - Filtered contracts
 *
 * Caches results to data/options/YYYY-MM-DD/{SYMBOL}.json
 * Use force=true to bypass cache and rescan live.
 *
 * SECURITY: Never exposes API keys in responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scanOptions } from '@/lib/brains/options';

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.trim().toUpperCase();
    const force = searchParams.get('force') === 'true';

    // Validate: symbol is required
    if (!symbol) {
        return NextResponse.json(
            {
                success: false,
                errorCode: 'BAD_REQUEST',
                error: 'Missing required query parameter: symbol',
            },
            { status: 400 },
        );
    }

    // Validate: symbol format (1-6 alphanumeric chars)
    if (!/^[A-Z]{1,6}$/.test(symbol)) {
        return NextResponse.json(
            {
                success: false,
                errorCode: 'BAD_REQUEST',
                error: 'Invalid symbol format. Use 1-6 letter ticker (e.g. AAPL, SPY)',
            },
            { status: 400 },
        );
    }

    try {
        // Parse optional liquidity overrides
        const minOI = searchParams.get('minOpenInterest');
        const minVol = searchParams.get('minVolume');
        const maxSpread = searchParams.get('maxBidAskSpreadPct');

        const liquidityConfig = {
            ...(minOI ? { minOpenInterest: parseInt(minOI, 10) } : {}),
            ...(minVol ? { minVolume: parseInt(minVol, 10) } : {}),
            ...(maxSpread ? { maxBidAskSpreadPct: parseFloat(maxSpread) } : {}),
        };

        const result = await scanOptions(symbol, liquidityConfig, force);

        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: result.errorCode || 'SCAN_ERROR',
                    error: result.error || 'Options scan failed',
                },
                { status: 502 },
            );
        }

        return NextResponse.json({
            success: true,
            symbol: result.data!.underlyingSymbol,
            underlyingPrice: result.data!.underlyingPrice,
            ivRank: result.data!.ivRank,
            expectedMove: result.data!.expectedMove,
            liquidityScore: result.data!.liquidityScore,
            strategySuggestion: result.data!.strategySuggestion,
            rationale: result.data!.rationale,
            contracts: result.data!.contracts,
            totalContractsScanned: result.data!.totalContractsScanned,
            scannedAt: result.data!.scannedAt,
            fromCache: result.fromCache ?? false,
        });
    } catch (err) {
        console.error('[OptionsScan] Unexpected error:', err instanceof Error ? err.message : 'Unknown');
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                error: 'Internal server error during options scan',
            },
            { status: 500 },
        );
    }
}
