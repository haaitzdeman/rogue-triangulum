export const dynamic = 'force-dynamic';

/**
 * Post-Close — Full Reconciliation + Ledger Write Loop
 *
 * POST /api/cron/post-close
 *
 * Runs after market close (16:10–20:00 ET) to:
 *   1. Pull final broker fills
 *   2. Link + reconcile journal entries (PLANNED → ENTERED → EXITED)
 *   3. Write realized PnL to trade_ledger for newly EXITED trades
 *   4. Report counts
 *
 * Security:
 *   - CRON_SECRET via Authorization: Bearer header → 404 if invalid
 *   - Feature flag: CRON_POST_CLOSE_ENABLED=true
 *
 * Locking:
 *   - Uses ops_job_locks with TTL 300s
 *   - Safe to retry; all writes are idempotent
 *
 * Idempotency:
 *   - upsertFills deduplicates on broker_trade_id
 *   - writeLedgerEntry deduplicates on entry_id
 *   - Reconciliation only advances status forward
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

const JOB_NAME = 'post-close';
const LOCK_TTL = 300; // 5 minutes

/** Post-close window: 16:10–20:00 ET */
const POST_CLOSE_START_MINUTES = 16 * 60 + 10; // 4:10 PM
const POST_CLOSE_END_MINUTES = 20 * 60;         // 8:00 PM

export async function GET(request: NextRequest) {
    // ── Auth ──────────────────────────────────────────────────────────────
    const auth = validateCronRequest(request, 'CRON_POST_CLOSE_ENABLED');
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const startedAt = new Date().toISOString();
    const clock = getMarketClock();

    // ── Post-close window gate ───────────────────────────────────────────
    // Parse clock.nowET to get minutes since midnight
    const etMatch = clock.nowET.match(/T(\d{2}):(\d{2})/);
    const etMinutes = etMatch ? parseInt(etMatch[1]) * 60 + parseInt(etMatch[2]) : 0;
    const isWeekday = clock.dayOfWeek >= 1 && clock.dayOfWeek <= 5;
    const inWindow = isWeekday && !clock.isHoliday &&
        etMinutes >= POST_CLOSE_START_MINUTES && etMinutes < POST_CLOSE_END_MINUTES;

    if (!inWindow) {
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
            reason: 'Outside post-close window (16:10–20:00 ET weekdays)',
            clock_snapshot: { nowET: clock.nowET, dayOfWeek: clock.dayOfWeek },
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

    // ── Execute post-close loop ──────────────────────────────────────────
    try {
        // Step 1: Pull today's fills + last 3 days (covers settlements)
        const now = new Date();
        const since = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
        const until = now.toISOString().slice(0, 10);

        const activities = await getTradeActivities(since, until);
        const fills = activities
            .map(mapActivityToFill)
            .filter((f): f is NonNullable<typeof f> => f !== null);

        // Step 2: Upsert fills (idempotent)
        const { inserted } = await upsertFills(fills);

        // Step 3: Link + reconcile + ledger write (all handled by journal-linker)
        // linkFillsToJournal runs reconciliation internally and writes to trade_ledger
        // for newly EXITED trades. writeLedgerEntry deduplicates on entry_id.
        let linkedCount = 0;
        let reconciledCount = 0;

        if (fills.length > 0) {
            try {
                const batchId = `post-close-${Date.now()}`;
                const linkResult = await linkFillsToJournal(fills, batchId);
                linkedCount = linkResult.linked + linkResult.created;
                reconciledCount = linkResult.reconciled;
            } catch (linkErr) {
                console.error('[PostClose] link/reconcile error:', String(linkErr).slice(0, 200));
            }
        }

        const counts = {
            fills_pulled: fills.length,
            fills_inserted: inserted,
            trades_linked: linkedCount,
            trades_reconciled: reconciledCount,
            // reconciledCount includes newly EXITED trades that had ledger writes
            newly_exited_trades: reconciledCount,
        };

        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'ran',
            fillsPulled: fills.length,
            tradesAdvanced: reconciledCount,
            ledgerRowsWritten: reconciledCount,
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
        }, { status: 500 });
    }
}
