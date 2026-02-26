import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getMarketClock } from '@/lib/market/market-hours';
import { POST as firstTradeUnlockCheck } from '@/app/api/dev/smoke/first-trade-unlock-check/route';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';

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
    if (latestCheck?.verdict === 'FAIL') degradedFlags.push('daily_check_failed');

    if (degradedFlags.length > 0) {
        return NextResponse.json({
            nextAction: 'INVESTIGATE_DEGRADED',
            why: `System has degraded flags: ${degradedFlags.join(', ')}`,
            requiredHumanAction: 'Investigate errors in job-run-store or daily checks.',
            suggestedEndpointToRun: '/api/dev/health'
        });
    }

    // 2. Run first trade unlock check directly
    // We pass a dummy request with the admin token so it passes auth
    const unlockReq = new NextRequest('http://localhost/api/dev/smoke/first-trade-unlock-check', {
        method: 'POST',
        headers: { 'x-admin-token': request.headers.get('x-admin-token') || '' }
    });

    let unlockRes;
    try {
        unlockRes = await firstTradeUnlockCheck(unlockReq);
    } catch (err) {
        return NextResponse.json({
            nextAction: 'INVESTIGATE_DEGRADED',
            why: 'first-trade-unlock-check threw an exception.',
            requiredHumanAction: 'Check server logs.',
            suggestedEndpointToRun: null
        });
    }

    const unlockData = await unlockRes.json();

    if (unlockData.status === 'FAIL') {
        const underlyingAction = unlockData.nextAction;

        if (underlyingAction === 'CONFIGURE_SUPABASE') {
            return NextResponse.json({
                nextAction: 'CONFIGURE_SUPABASE',
                why: 'Supabase environment variables are missing.',
                requiredHumanAction: 'Add Supabase URLs and Keys to Vercel/Local env.',
                suggestedEndpointToRun: '/api/dev/env-health'
            });
        }

        if (underlyingAction === 'WAITING_FOR_FIRST_TRADE') {
            if (!clock.isMarketOpen && !clock.isExtendedHours) {
                return NextResponse.json({
                    nextAction: 'WAIT_FOR_MARKET_OPEN',
                    why: `Market is closed. First trade cannot be placed. Next open: ${clock.nextOpenET}`,
                    requiredHumanAction: 'Wait for market hours.',
                    suggestedEndpointToRun: null
                });
            } else {
                return NextResponse.json({
                    nextAction: 'PLACE_FIRST_TRADE',
                    why: 'System needs a complete paper trade lifecycle (buy, sync, sell, sync).',
                    requiredHumanAction: 'Place a paper trade in Alpaca dashboard.',
                    suggestedEndpointToRun: '/api/dev/smoke/guided-first-trade'
                });
            }
        }

        if (underlyingAction === 'RUN_POST_CLOSE') {
            return NextResponse.json({
                nextAction: 'RUN_POST_CLOSE',
                why: 'Trade exited, but ledger reconciliation is missing.',
                requiredHumanAction: 'Run the post-close cron manually (or wait for it) to reconcile ledger.',
                suggestedEndpointToRun: '/api/cron/post-close?force=true'
            });
        }

        // Catch-all for other failures in unlock check
        return NextResponse.json({
            nextAction: underlyingAction || 'INVESTIGATE_DEGRADED',
            why: unlockData.reasons?.join(' ') || 'Unlock check failed for unknown reasons.',
            requiredHumanAction: 'Investigate the exact reasons returned.',
            suggestedEndpointToRun: '/api/dev/smoke/first-trade-unlock-check'
        });
    }

    // 3. All Good
    return NextResponse.json({
        nextAction: 'SYSTEM_OPERATIONAL',
        why: 'First trade unlock is passed and no degraded flags detected.',
        requiredHumanAction: null,
        suggestedEndpointToRun: null
    });
}
