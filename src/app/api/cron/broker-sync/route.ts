export const dynamic = 'force-dynamic';

/**
 * Cron Broker Sync — V2
 *
 * GET /api/cron/broker-sync
 *
 * Vercel Cron-compatible endpoint that syncs Alpaca paper fills.
 *
 * V2 UPGRADE:
 *   - Uses validateCronRequest (Authorization: Bearer CRON_SECRET) + feature flag
 *   - Job-lock protected (TTL 120s)
 *   - Writes ops_job_runs for observability
 *   - Market-hours gated (skip when closed)
 *   - Returns 404 when unauthorized
 *   - Idempotent via broker_trade_id dedup
 *
 * SAFETY:
 *   - Paper-only (alpaca-client rejects non-paper URLs)
 *   - Never places orders or submits trades
 *   - Read fills + upsert to DB only
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

const JOB_NAME = 'broker-sync';
const LOCK_TTL = 120; // 2 minutes

export async function GET(request: NextRequest) {
    // ── Auth (V2: validateCronRequest with diagnostic codes) ──────────────
    const auth = validateCronRequest(request, 'CRON_BROKER_SYNC_ENABLED');
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const startedAt = new Date().toISOString();
    const clock = getMarketClock();

    // ── Market gate — skip when market is fully closed ────────────────────
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
            clock_snapshot: {
                nowET: clock.nowET,
                isMarketOpen: clock.isMarketOpen,
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
        });
    }

    // ── Execute sync ─────────────────────────────────────────────────────
    try {
        const now = new Date();
        const since = new Date(now.getTime() - 7 * 86400000)
            .toISOString()
            .slice(0, 10);
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
                const batchId = `cron-${Date.now()}`;
                const linkResult = await linkFillsToJournal(fills, batchId);
                linkedCount = linkResult.linked + linkResult.created;
                reconciledCount = linkResult.reconciled;
            } catch (linkErr) {
                console.error(
                    '[CronBrokerSync] journal link error:',
                    String(linkErr).slice(0, 200),
                );
            }
        }

        console.log(
            `[CronBrokerSync] fetched=${activities.length} mapped=${fills.length} inserted=${inserted} skipped=${skipped} linked=${linkedCount} reconciled=${reconciledCount}`,
        );

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
            success: true,
            run_id: lock.runId,
            outcome: 'ran',
            rangeUsed: { since, until },
            fetchedCount: activities.length,
            mappedCount: fills.length,
            insertedCount: inserted,
            skippedCount: skipped,
            linkedCount,
            reconciledCount,
            syncedAt: new Date().toISOString(),
            clock_snapshot: {
                nowET: clock.nowET,
                isMarketOpen: clock.isMarketOpen,
                isExtendedHours: clock.isExtendedHours,
            },
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        console.error('[CronBrokerSync] error:', message);

        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'error',
            errorSummary: message,
        }).catch(() => { });

        await releaseLock(JOB_NAME, lock.runId, message).catch(() => { });

        return NextResponse.json(
            {
                success: false,
                run_id: lock.runId,
                outcome: 'error',
                error: message,
                syncedAt: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
