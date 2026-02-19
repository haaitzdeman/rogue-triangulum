export const dynamic = 'force-dynamic';

/**
 * Paper E2E Smoke Test API Route
 *
 * POST /api/dev/smoke/paper-e2e
 *
 * Admin-gated, read-only smoke test that verifies the full
 * paper trading pipeline is healthy:
 *   1. Accounting (loadDailySummary)
 *   2. Risk state (computeDailyRiskState)
 *   3. Broker connectivity (getAccount)
 *
 * SAFETY: This endpoint NEVER trades or places orders.
 *
 * Returns:
 *   404 — not admin (hides endpoint)
 *   200 — { status: "PASS"|"FAIL", checks: [...], checkedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import {
    isServerSupabaseConfigured,
    createServerSupabase,
} from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';
import { computeDailyRiskState } from '@/lib/risk/risk-engine';
import { getRiskConfig } from '@/lib/risk/risk-config';
import { loadRiskEntriesForDate } from '@/lib/risk/risk-loader';
import { loadRealizedPnLForDate } from '@/lib/accounting/trade-ledger-store';
import { isAlpacaConfigured, getAccount } from '@/lib/broker/alpaca-client';

interface CheckResult {
    name: string;
    pass: boolean;
    detail?: string;
    error?: string;
}

export async function POST(request: NextRequest) {
    // Admin gate — return 404 to hide endpoint from public
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    const checks: CheckResult[] = [];

    // =========================================================================
    // Check 1: Accounting — loadDailySummary
    // =========================================================================
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            const summary = await loadDailySummary(supabase, today);
            checks.push({
                name: 'ACCOUNTING',
                pass: true,
                detail: `${summary.tradeCount} trades, PnL $${summary.realizedPnl.toFixed(2)}, ${summary.symbols.length} symbols`,
            });
        } catch (err) {
            checks.push({
                name: 'ACCOUNTING',
                pass: false,
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
            });
        }
    } else {
        checks.push({
            name: 'ACCOUNTING',
            pass: false,
            error: 'Server Supabase not configured',
        });
    }

    // =========================================================================
    // Check 2: Risk State
    // =========================================================================
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            const config = getRiskConfig();
            const entries = await loadRiskEntriesForDate(supabase, today);

            let ledgerRealizedPnl: number | undefined;
            try {
                ledgerRealizedPnl = await loadRealizedPnLForDate(supabase, today);
            } catch {
                // Ledger unavailable — not fatal
            }

            const state = computeDailyRiskState(entries, config, { ledgerRealizedPnl });
            checks.push({
                name: 'RISK_STATE',
                pass: true,
                detail: `${entries.length} entries, realized $${(ledgerRealizedPnl ?? 0).toFixed(2)}, lossBreached=${state.dailyLossLimitBreached}`,
            });
        } catch (err) {
            checks.push({
                name: 'RISK_STATE',
                pass: false,
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
            });
        }
    } else {
        checks.push({
            name: 'RISK_STATE',
            pass: false,
            error: 'Server Supabase not configured',
        });
    }

    // =========================================================================
    // Check 3: Broker Connectivity
    // =========================================================================
    const alpacaConfig = isAlpacaConfigured();
    if (alpacaConfig.hasApiKey && alpacaConfig.hasApiSecret) {
        try {
            const account = await getAccount();
            checks.push({
                name: 'BROKER',
                pass: account.status === 'ACTIVE',
                detail: `status=${account.status}, currency=${account.currency}, baseUrl=${alpacaConfig.effectiveBaseUrl}`,
            });
        } catch (err) {
            checks.push({
                name: 'BROKER',
                pass: false,
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
            });
        }
    } else {
        checks.push({
            name: 'BROKER',
            pass: false,
            error: 'ALPACA_API_KEY and/or ALPACA_API_SECRET not set',
        });
    }

    // =========================================================================
    // Aggregate
    // =========================================================================
    const allPass = checks.every((c) => c.pass);

    return NextResponse.json({
        status: allPass ? 'PASS' : 'FAIL',
        date: today,
        checks,
        checkedAt: new Date().toISOString(),
    });
}
