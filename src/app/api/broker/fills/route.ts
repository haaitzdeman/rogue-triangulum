/**
 * Broker Fills API Route
 *
 * GET /api/broker/fills?since=&until=&symbol=
 * Returns normalized fills from the database (not live broker).
 */

import { NextResponse } from 'next/server';
import { queryFills } from '@/lib/broker/fill-store';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const filters = {
            since: searchParams.get('since') || undefined,
            until: searchParams.get('until') || undefined,
            symbol: searchParams.get('symbol') || undefined,
        };

        const fills = await queryFills(filters);

        return NextResponse.json({
            success: true,
            fills,
            count: fills.length,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[BrokerFills] error:', message.slice(0, 200));

        return NextResponse.json(
            {
                success: false,
                error: message.slice(0, 200),
                fills: [],
                count: 0,
            },
            { status: 500 }
        );
    }
}
