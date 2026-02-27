import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getMarketClock } from '@/lib/market/market-hours';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { computeNextAction, computeFirstTradeProcessed } from '@/lib/ops/next-action';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const clock = getMarketClock();

    // 1. Check for degraded system state
    const [latestRuns, latestCheck] = await Promise.all([
        getLatestJobRuns().catch(() => ({} as Record<string, unknown>)),
        getLatestDailyCheck().catch(() => null),
    ]);

    // 2. Compute first trade
    const isSupabase = isServerSupabaseConfigured();
    const supabase = isSupabase ? createServerSupabase() : null;
    const firstTrade = await computeFirstTradeProcessed(supabase);

    // 3. Compute next action
    const instruction = computeNextAction({
        now: new Date(),
        marketClock: clock,
        hasFirstTradeProcessed: firstTrade.ok,
        firstTradeReasons: firstTrade.reasons,
        firstTradeAction: firstTrade.nextAction,
        cronCapability: 'DAILY_ONLY (HOBBY)',
        lastJobRuns: latestRuns,
        lastDailyCheck: latestCheck,
        isSupabaseConfigured: isSupabase,
    });

    return NextResponse.json(instruction);
}
