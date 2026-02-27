import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { checkFirstTradeUnlock } from '@/lib/ops/first-trade-unlock';
import { computeNextAction } from '@/lib/ops/next-action';
import { getMarketClock } from '@/lib/market/market-hours';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const clock = getMarketClock();

    if (!isServerSupabaseConfigured()) {
        return NextResponse.json({
            status: 'FAIL',
            reasons: ['Supabase not configured'],
            nextAction: 'CONFIGURE_SUPABASE'
        });
    }

    const supabase = createServerSupabase();
    const result = await checkFirstTradeUnlock(supabase);

    const instruction = computeNextAction({
        marketClock: clock,
        unlockOk: result.ok
    });

    if (!result.ok) {
        return NextResponse.json({
            status: 'FAIL',
            reasons: result.reasons,
            nextAction: instruction.nextAction
        });
    }

    return NextResponse.json({
        status: 'PASS',
        reasons: [],
        nextAction: instruction.nextAction,
        details: result.sample
    });
}
