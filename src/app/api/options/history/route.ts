/**
 * Options History API Route
 *
 * GET /api/options/history
 *
 * Returns list of cached option scans with summary fields.
 * Reads from data/options/YYYY-MM-DD/*.json
 */

import { NextResponse } from 'next/server';
import { listCachedScans } from '@/lib/brains/options';

export async function GET() {
    try {
        const scans = listCachedScans();

        return NextResponse.json({
            success: true,
            history: scans,
            count: scans.length,
        });
    } catch (error) {
        console.error('[OptionsHistory] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
