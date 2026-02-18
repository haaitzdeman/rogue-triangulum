export const dynamic = 'force-dynamic';

/**
 * Purge Cache API Route
 *
 * POST /api/dev/purge-cache
 *
 * Admin-gated: Deletes morning run data older than N days from DB,
 * and options cache data from filesystem.
 * Body: { daysToKeep: number } (default 14)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { purgeMorningRunsBefore } from '@/lib/integration/morning-run-store';

// Options cache still in filesystem
const FS_CACHE_DIRS = [
    'data/options',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Admin gate
    const auth = checkAdminAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { success: false, error: auth.reason || 'Unauthorized' },
            { status: 401 },
        );
    }

    let daysToKeep = 14;
    try {
        const body = await request.json();
        if (typeof body.daysToKeep === 'number' && body.daysToKeep > 0) {
            daysToKeep = body.daysToKeep;
        }
    } catch {
        // Use default
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const purgedDirs: string[] = [];
    const errors: string[] = [];
    let dbPurged = 0;

    // Purge morning runs from DB
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            dbPurged = await purgeMorningRunsBefore(supabase, cutoffStr);
        } catch (err) {
            errors.push(`DB purge failed: ${String(err).slice(0, 100)}`);
        }
    }

    // Purge filesystem caches (options only now)
    for (const cacheDir of FS_CACHE_DIRS) {
        if (!fs.existsSync(cacheDir)) continue;

        try {
            const entries = fs.readdirSync(cacheDir);
            for (const entry of entries) {
                // Only process date-formatted directories (YYYY-MM-DD)
                if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;

                if (entry < cutoffStr) {
                    const dirPath = path.join(cacheDir, entry);
                    try {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                        purgedDirs.push(dirPath);
                    } catch (err) {
                        errors.push(`Failed to delete ${dirPath}: ${String(err).slice(0, 100)}`);
                    }
                }
            }
        } catch (err) {
            errors.push(`Failed to read ${cacheDir}: ${String(err).slice(0, 100)}`);
        }
    }

    return NextResponse.json({
        success: true,
        daysToKeep,
        cutoffDate: cutoffStr,
        purgedCount: purgedDirs.length + dbPurged,
        purgedDirs,
        dbPurged,
        errors: errors.length > 0 ? errors : undefined,
    });
}
