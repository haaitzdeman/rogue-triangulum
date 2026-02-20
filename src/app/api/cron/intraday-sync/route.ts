export const dynamic = 'force-dynamic';

/**
 * Intraday Sync — Cron Broker Sync During Market Hours
 *
 * POST /api/cron/intraday-sync
 *
 * Vercel-cron-compatible endpoint that syncs Alpaca paper fills
 * during market hours (regular + extended).
 *
 * Security:
 *   - CRON_SECRET via Authorization: Bearer header → 404 if invalid
 *   - Feature flag: CRON_INTRADAY_SYNC_ENABLED=true
 *
 * Locking:
 *   - Uses ops_job_locks with TTL 120s
 *   - Safe to retry; idempotent via broker_trade_id dedup
 *
 * Market gating:
 *   - Only runs when isMarketOpen OR isExtendedHours
 *   - Returns skipped_closed when market is closed
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/ops/cron-auth';
import { acquireLock, releaseLock } from '@/lib/ops/job-lock';
import { writeJobRun } from '@/lib/ops/job-run-store';
import { getMarketClock } from '@/lib/market/market-hours';
import { getTradeActivities } from '@/lib/broker/alpaca-client';
import { mapActivityToFill } from '@/lib/broker/alpaca-mapper';
import { upsertFills } from '@/lib/broker/fill-store';
import { linkFillsToJournal } from '@/lib/broker/journal-linker';

const JOB_NAME = 'intraday-sync';
const LOCK_TTL = 120; // 2 minutes

export async function POST(request: NextRequest) {
    // ── Auth ──────────────────────────────────────────────────────────────
    const auth = validateCronRequest(request, 'CRON_INTRADAY_SYNC_ENABLED');
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const startedAt = new Date().toISOString();
    const clock = getMarketClock();

    // ── Market gate ──────────────────────────────────────────────────────
    if (!clock.isMarketOpen && !clock.isExtendedHours) {
        const runId = `${JOB_NAME}-skip-${Date.now()}`;
        await writeJobRun({
            runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'skipped_closed',
        }).catch(() => { });

        return NextResponse.json({
            run_id: runId,
            outcome: 'skipped_closed',
            counts: { fills_pulled: 0, inserted: 0, linked: 0, reconciled: 0 },
            clock_snapshot: {
                nowET: clock.nowET,
                isMarketOpen: clock.isMarketOpen,
                isExtendedHours: clock.isExtendedHours,
                nextOpenET: clock.nextOpenET,
            },
        });
    }

    // ── Lock ─────────────────────────────────────────────────────────────
    const lock = await acquireLock(JOB_NAME, LOCK_TTL);
    if (!lock.acquired) {
        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'skipped_locked',
        }).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            outcome: 'skipped_locked',
            reason: lock.reason,
            counts: { fills_pulled: 0, inserted: 0, linked: 0, reconciled: 0 },
            clock_snapshot: { nowET: clock.nowET },
        });
    }

    // ── Execute sync ─────────────────────────────────────────────────────
    try {
        // Pull last 2 days of fills (covers overnight + today)
        const now = new Date();
        const since = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
        const until = now.toISOString().slice(0, 10);

        const activities = await getTradeActivities(since, until);
        const fills = activities
            .map(mapActivityToFill)
            .filter((f): f is NonNullable<typeof f> => f !== null);

        const { inserted, skipped } = await upsertFills(fills);

        let linkedCount = 0;
        let reconciledCount = 0;
        if (inserted > 0) {
            try {
                const batchId = `intraday-${Date.now()}`;
                const linkResult = await linkFillsToJournal(fills, batchId);
                linkedCount = linkResult.linked + linkResult.created;
                reconciledCount = linkResult.reconciled;
            } catch (linkErr) {
                console.error('[IntradaySync] link error:', String(linkErr).slice(0, 200));
            }
        }

        const counts = {
            fills_pulled: fills.length,
            inserted,
            skipped,
            linked: linkedCount,
            reconciled: reconciledCount,
        };

        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'ran',
            fillsPulled: fills.length,
            tradesAdvanced: reconciledCount,
        }).catch(() => { });

        await releaseLock(JOB_NAME, lock.runId).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            outcome: 'ran',
            counts,
            clock_snapshot: {
                nowET: clock.nowET,
                isMarketOpen: clock.isMarketOpen,
                isExtendedHours: clock.isExtendedHours,
                extendedSession: clock.extendedSession,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'error',
            errorSummary: msg,
        }).catch(() => { });

        await releaseLock(JOB_NAME, lock.runId, msg).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            outcome: 'error',
            error: msg,
            clock_snapshot: { nowET: clock.nowET },
        }, { status: 500 });
    }
}
