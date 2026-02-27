import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getMarketClock } from '@/lib/market/market-hours';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { computeNextAction } from '@/lib/ops/next-action';
import { checkFirstTradeUnlock } from '@/lib/ops/first-trade-unlock';

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

    const degradedFlags: string[] = [];
    for (const jobName of ['intraday-sync', 'post-close', 'daily-self-check', 'broker-sync']) {
        const run = latestRuns[jobName] as { outcome?: string } | undefined;
        if (run?.outcome === 'error') degradedFlags.push(`${jobName}_error`);
    }
    const check = latestCheck as { verdict?: string } | null;
    if (check?.verdict === 'FAIL') degradedFlags.push('daily_check_failed');

    // 2. Compute first trade status
    const isSupabase = isServerSupabaseConfigured();
    const supabase = isSupabase ? createServerSupabase() : null;
    const unlockResult = await checkFirstTradeUnlock(supabase);

    // 3. Exact deterministic next action output
    const instruction = computeNextAction({
        marketClock: clock,
        unlockOk: unlockResult.ok,
        degradedFlags
    });

    if (!isSupabase) {
        return NextResponse.json({
            nextAction: 'CONFIGURE_SUPABASE',
            why: 'Supabase environment variables are missing.',
            requiredHumanAction: 'Add Supabase URLs and Keys to Vercel/Local env.',
            suggestedEndpointToRun: '/api/dev/env-health'
        });
    }

    return NextResponse.json(instruction);
}
