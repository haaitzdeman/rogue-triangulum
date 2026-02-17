/**
 * Risk Health API Route
 *
 * GET /api/dev/risk-health
 *
 * Returns system status for risk infrastructure:
 * - Server DB configured
 * - Can read premarket journal
 * - Can read options journal
 * - Risk engine smoke test
 */

import { NextRequest, NextResponse } from 'next/server';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { computeDailyRiskState } from '@/lib/risk/risk-engine';
import { getRiskConfig } from '@/lib/risk/risk-config';
import { checkAdminAuth } from '@/lib/auth/admin-gate';

interface HealthCheck {
    name: string;
    pass: boolean;
    detail?: string;
}

export async function GET(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const checks: HealthCheck[] = [];
    const config = getRiskConfig();

    // 1) Server DB configured
    const dbConfigured = isServerSupabaseConfigured();
    checks.push({
        name: 'SERVER_DB_CONFIGURED',
        pass: dbConfigured,
        detail: dbConfigured
            ? 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY present'
            : 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    });

    if (dbConfigured) {
        try {
            const db = createServerSupabase();
            const today = new Date().toISOString().slice(0, 10);

            // 2) Can read premarket journal
            try {
                const { count, error } = await db
                    .from('premarket_journal_entries')
                    .select('id', { count: 'exact', head: true })
                    .eq('effective_date', today);
                checks.push({
                    name: 'CAN_READ_PREMARKET_JOURNAL',
                    pass: !error,
                    detail: error ? error.message : `${count ?? 0} entries today`,
                });
            } catch (e) {
                checks.push({
                    name: 'CAN_READ_PREMARKET_JOURNAL',
                    pass: false,
                    detail: e instanceof Error ? e.message : 'Unknown error',
                });
            }

            // 3) Can read options journal
            try {
                const { count, error } = await db
                    .from('options_journal_entries')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', `${today}T00:00:00`);
                checks.push({
                    name: 'CAN_READ_OPTIONS_JOURNAL',
                    pass: !error,
                    detail: error ? error.message : `${count ?? 0} entries today`,
                });
            } catch (e) {
                checks.push({
                    name: 'CAN_READ_OPTIONS_JOURNAL',
                    pass: false,
                    detail: e instanceof Error ? e.message : 'Unknown error',
                });
            }
        } catch (e) {
            checks.push(
                { name: 'CAN_READ_PREMARKET_JOURNAL', pass: false, detail: e instanceof Error ? e.message : 'DB init failed' },
                { name: 'CAN_READ_OPTIONS_JOURNAL', pass: false, detail: e instanceof Error ? e.message : 'DB init failed' },
            );
        }
    } else {
        checks.push(
            { name: 'CAN_READ_PREMARKET_JOURNAL', pass: false, detail: 'Server DB not configured' },
            { name: 'CAN_READ_OPTIONS_JOURNAL', pass: false, detail: 'Server DB not configured' },
        );
    }

    // 4) Risk engine smoke test
    try {
        const state = computeDailyRiskState([], config);
        checks.push({
            name: 'RISK_ENGINE_OK',
            pass: state.realizedPnl === 0 && state.openPositions === 0,
            detail: 'Empty-set smoke test passed',
        });
    } catch (e) {
        checks.push({
            name: 'RISK_ENGINE_OK',
            pass: false,
            detail: e instanceof Error ? e.message : 'Engine threw',
        });
    }

    const allPass = checks.every(c => c.pass);

    return NextResponse.json({
        status: allPass ? 'PASS' : 'FAIL',
        config: {
            dailyMaxLoss: config.dailyMaxLoss,
            perTradeMaxRisk: config.perTradeMaxRisk,
            maxOpenPositions: config.maxOpenPositions,
            scope: config.duplicatePositionScope,
        },
        checks,
    });
}
