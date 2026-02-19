export const dynamic = 'force-dynamic';

/**
 * Cron Broker Sync API Route
 *
 * GET /api/cron/broker-sync
 *
 * Vercel Cron-compatible endpoint that syncs Alpaca paper fills.
 *
 * Security:
 *   - Requires Authorization: Bearer <CRON_SECRET> header
 *   - Feature-flagged: CRON_BROKER_SYNC_ENABLED must be "true"
 *   - Returns 404 if secret missing or feature disabled (hides existence)
 *
 * SAFETY:
 *   - Paper-only (alpaca-client rejects non-paper URLs)
 *   - Never places orders or submits trades
 *   - Read fills + upsert to DB only
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradeActivities } from '@/lib/broker/alpaca-client';
import { mapActivityToFill } from '@/lib/broker/alpaca-mapper';
import { upsertFills } from '@/lib/broker/fill-store';
import { linkFillsToJournal } from '@/lib/broker/journal-linker';

/**
 * Validate the cron secret from the Authorization header.
 * Vercel sends: Authorization: Bearer <CRON_SECRET>
 */
function validateCronSecret(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;

    const authHeader = request.headers.get('authorization');
    if (!authHeader) return false;

    const token = authHeader.replace(/^Bearer\s+/i, '');
    return token === cronSecret;
}

export async function GET(request: NextRequest) {
    // Feature flag check
    if (process.env.CRON_BROKER_SYNC_ENABLED !== 'true') {
        return new NextResponse(null, { status: 404 });
    }

    // Cron secret check — return 404 to hide existence
    if (!validateCronSecret(request)) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        // Sync last 7 days of fills
        const now = new Date();
        const since = new Date(now.getTime() - 7 * 86400000)
            .toISOString()
            .slice(0, 10);
        const until = now.toISOString().slice(0, 10);

        // Fetch from Alpaca
        const activities = await getTradeActivities(since, until);
        const fills = activities
            .map(mapActivityToFill)
            .filter((f): f is NonNullable<typeof f> => f !== null);

        // Upsert to DB
        const { inserted, skipped } = await upsertFills(fills);

        // Link to journal entries + reconcile
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

        return NextResponse.json({
            success: true,
            rangeUsed: { since, until },
            fetchedCount: activities.length,
            mappedCount: fills.length,
            insertedCount: inserted,
            skippedCount: skipped,
            linkedCount,
            reconciledCount,
            syncedAt: new Date().toISOString(),
        });
    } catch (err) {
        const message =
            err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
        console.error('[CronBrokerSync] error:', message);

        return NextResponse.json(
            {
                success: false,
                error: message,
                syncedAt: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
