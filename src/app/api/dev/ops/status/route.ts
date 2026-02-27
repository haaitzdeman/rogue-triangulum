export const dynamic = 'force-dynamic';

/**
 * Ops Status — Single Pane of Glass
 *
 * GET /api/dev/ops/status
 *
 * Admin-gated endpoint that returns operational status:
 *   - Latest job run outcomes (intraday-sync, post-close, daily-self-check)
 *   - Latest daily check verdict
 *   - Degraded flags
 *   - Error summaries
 *
 * 404 when not admin authenticated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getLatestJobRuns, getLatestDailyCheck } from '@/lib/ops/job-run-store';
import { getMarketClock } from '@/lib/market/market-hours';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { computeNextAction } from '@/lib/ops/next-action';
import { checkFirstTradeUnlock } from '@/lib/ops/first-trade-unlock';

export async function GET(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const clock = getMarketClock();

    // Fetch latest job runs and daily check
    const [latestRuns, latestCheck] = await Promise.all([
        getLatestJobRuns().catch(() => ({} as Record<string, unknown>)),
        getLatestDailyCheck().catch(() => null),
    ]);

    // Build degraded flags
    const degradedFlags: string[] = [];
    const errorSummaries: Record<string, string> = {};

    const jobNames = ['intraday-sync', 'post-close', 'daily-self-check', 'broker-sync'];
    for (const jobName of jobNames) {
        const run = latestRuns[jobName] as { outcome?: string; error_summary?: string } | undefined;
        if (run?.outcome === 'error') {
            degradedFlags.push(`${jobName}_error`);
            if (run.error_summary) {
                errorSummaries[jobName] = run.error_summary;
            }
        }
    }

    const check = latestCheck as { verdict?: string } | null;
    if (check?.verdict === 'FAIL') {
        degradedFlags.push('daily_check_failed');
    }

    // Compute first trade
    const isSupabase = isServerSupabaseConfigured();
    const supabase = isSupabase ? createServerSupabase() : null;
    const unlockResult = await checkFirstTradeUnlock(supabase);

    // Determine nextAction via shared logic
    const instruction = computeNextAction({
        marketClock: clock,
        unlockOk: unlockResult.ok,
        degradedFlags
    });
    const nextAction = instruction.nextAction;

    // Calculate cron capability and warnings
    const cronCapability = 'DAILY_ONLY (HOBBY)';
    const systemWarnings: string[] = [];
    if (process.env.CRON_INTRADAY_SYNC_ENABLED === 'true') {
        systemWarnings.push('CRON_INTRADAY_SYNC_ENABLED is true, but Hobby tier only supports daily cron. Intraday sync will not execute automatically.');
    }

    return NextResponse.json({
        nextAction,
        cronCapability,
        systemWarnings,
        clock: {
            nowET: clock.nowET,
            isMarketOpen: clock.isMarketOpen,
            isExtendedHours: clock.isExtendedHours,
            nextOpenET: clock.nextOpenET,
        },
        jobs: {
            'intraday-sync': latestRuns['intraday-sync'] ?? null,
            'post-close': latestRuns['post-close'] ?? null,
            'daily-self-check': latestRuns['daily-self-check'] ?? null,
            'broker-sync': latestRuns['broker-sync'] ?? null,
        },
        dailyCheck: latestCheck ? {
            verdict: latestCheck.verdict,
            reasons: latestCheck.reasons,
            checkedAt: latestCheck.checked_at,
        } : null,
        degradedFlags,
        errorSummaries,
        checkedAt: new Date().toISOString(),
    });
}
