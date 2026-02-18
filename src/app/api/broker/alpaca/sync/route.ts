export const dynamic = 'force-dynamic';

/**
 * Alpaca Sync API Route
 *
 * POST /api/broker/alpaca/sync
 * Pulls fills from Alpaca and upserts into broker_trade_fills.
 *
 * Body: { since?: "YYYY-MM-DD", until?: "YYYY-MM-DD", dryRun?: boolean }
 *
 * SAFETY:
 * - Paper-only (alpaca-client rejects non-paper URLs)
 * - 30-day max date range
 * - Never places orders or submits trades
 * - Never logs/returns API keys
 */

import { NextResponse } from 'next/server';
import { getTradeActivities } from '@/lib/broker/alpaca-client';
import { mapActivityToFill } from '@/lib/broker/alpaca-mapper';
import { upsertFills } from '@/lib/broker/fill-store';
import { linkFillsToJournal } from '@/lib/broker/journal-linker';
import type { SyncResult } from '@/lib/broker/types';
import { requireSchemaOr503 } from '@/lib/guards/schema-gate';

const MAX_RANGE_DAYS = 30;

/** Tables required for broker sync to operate correctly */
const REQUIRED_TABLES = ['broker_trade_fills', 'premarket_journal_entries', 'trade_ledger'];

function makeErrorResult(errorCode: string, error: string): SyncResult {
    return {
        success: false,
        fetchedCount: 0,
        mappedCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        linkedCount: 0,
        reconciledCount: 0,
        rangeUsed: { since: '', until: '' },
        samplePreview: [],
        lastSyncedAt: new Date().toISOString(),
        errorCode,
        error,
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { since, until, dryRun } = body as {
            since?: string;
            until?: string;
            dryRun?: boolean;
        };

        // Schema gate — fail-closed if required tables are missing (skip for dry runs)
        if (!dryRun) {
            const gate = await requireSchemaOr503(REQUIRED_TABLES, 'BrokerSync');
            if (!gate.pass) return gate.response;
        }

        // Default range: last 7 days if no since provided
        const now = new Date();
        const effectiveSince = since || new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const effectiveUntil = until || now.toISOString().slice(0, 10);

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(effectiveSince) || !dateRegex.test(effectiveUntil)) {
            return NextResponse.json(
                makeErrorResult('BAD_REQUEST', 'Invalid date format. Use YYYY-MM-DD.'),
                { status: 400 }
            );
        }

        // 30-day cap
        const sinceDate = new Date(effectiveSince);
        const untilDate = new Date(effectiveUntil);
        const rangeDays = (untilDate.getTime() - sinceDate.getTime()) / 86400000;

        if (rangeDays < 0) {
            return NextResponse.json(
                makeErrorResult('BAD_REQUEST', '"since" must be before "until".'),
                { status: 400 }
            );
        }

        if (rangeDays > MAX_RANGE_DAYS) {
            return NextResponse.json(
                makeErrorResult('RANGE_TOO_LARGE', `Max ${MAX_RANGE_DAYS} days per sync. Got ${Math.ceil(rangeDays)} days.`),
                { status: 400 }
            );
        }

        const rangeUsed = { since: effectiveSince, until: effectiveUntil };

        // Fetch fills from Alpaca
        const activities = await getTradeActivities(effectiveSince, effectiveUntil);
        const fetchedCount = activities.length;

        // Map to normalized fills
        const fills = activities
            .map(mapActivityToFill)
            .filter((f): f is NonNullable<typeof f> => f !== null);

        const mappedCount = fills.length;
        const samplePreview = fills.slice(0, 10);

        // Dry run: return counts without DB writes
        if (dryRun) {
            const result: SyncResult = {
                success: true,
                fetchedCount,
                mappedCount,
                insertedCount: mappedCount, // would-be inserted
                skippedCount: 0,
                linkedCount: 0,
                reconciledCount: 0,
                rangeUsed,
                samplePreview,
                lastSyncedAt: new Date().toISOString(),
            };
            return NextResponse.json(result);
        }

        // Upsert into database
        const { inserted, skipped } = await upsertFills(fills);

        // Auto-link to journal entries + reconcile outcomes
        let linkedCount = 0;
        let reconciledCount = 0;
        if (inserted > 0) {
            try {
                const syncBatchId = `sync-${Date.now()}`;
                const linkResult = await linkFillsToJournal(fills, syncBatchId);
                linkedCount = linkResult.linked + linkResult.created;
                reconciledCount = linkResult.reconciled;
            } catch (linkErr) {
                console.error('[BrokerSync] journal link error:', String(linkErr).slice(0, 200));
                // Non-fatal: sync still succeeded
            }
        }

        const result: SyncResult = {
            success: true,
            fetchedCount,
            mappedCount,
            insertedCount: inserted,
            skippedCount: skipped,
            linkedCount,
            reconciledCount,
            rangeUsed,
            samplePreview,
            lastSyncedAt: new Date().toISOString(),
        };

        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[BrokerSync] error:', message.slice(0, 200));

        // Check for LIVE_DISABLED specifically
        const errorCode = message.includes('LIVE_DISABLED') ? 'LIVE_DISABLED' : 'SYNC_FAILED';

        return NextResponse.json(
            makeErrorResult(errorCode, message.slice(0, 200)),
            { status: errorCode === 'LIVE_DISABLED' ? 403 : 500 }
        );
    }
}
