export const dynamic = 'force-dynamic';

/**
 * Paper Trade Lifecycle Validator
 *
 * POST /api/dev/smoke/paper-trade-lifecycle
 *
 * Admin-gated, READ-ONLY — NEVER trades or writes.
 *
 * Runs:
 *   1. Broker health (getAccount)
 *   2. Risk state (computeDailyRiskState)
 *   3. Accounting daily summary (loadDailySummary)
 *
 * Returns:
 *   404 — not admin
 *   200 — { status, checks, nextAction, date, checkedAt }
 *
 * nextAction logic:
 *   tradeCount == 0           → WAITING_FOR_FIRST_TRADE
 *   openPositions > 0         → TRADE_OPEN
 *   realizedPnl != 0          → TRADE_CLOSED
 *   else                      → WAITING_FOR_FIRST_TRADE
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

interface CheckStatus {
    status: 'PASS' | 'FAIL';
    detail?: string;
    error?: string;
}

export async function POST(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    const checks: Record<string, CheckStatus> = {};

    let tradeCount = 0;
    let openPositions = 0;
    let realizedPnl = 0;

    // ── Broker Health ────────────────────────────────────────────────────
    const alpacaCfg = isAlpacaConfigured();
    if (alpacaCfg.hasApiKey && alpacaCfg.hasApiSecret) {
        try {
            const account = await getAccount();
            checks.broker = {
                status: account.status === 'ACTIVE' ? 'PASS' : 'FAIL',
                detail: `status=${account.status}, currency=${account.currency}`,
            };
        } catch (err) {
            checks.broker = {
                status: 'FAIL',
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
            };
        }
    } else {
        checks.broker = {
            status: 'FAIL',
            error: 'ALPACA_API_KEY and/or ALPACA_API_SECRET not set',
        };
    }

    // ── Risk State ───────────────────────────────────────────────────────
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            const config = getRiskConfig();
            const entries = await loadRiskEntriesForDate(supabase, today);

            let ledgerPnl: number | undefined;
            try {
                ledgerPnl = await loadRealizedPnLForDate(supabase, today);
            } catch {
                // non-fatal
            }

            const state = computeDailyRiskState(entries, config, {
                ledgerRealizedPnl: ledgerPnl,
            });

            openPositions = state.openPositions;
            realizedPnl = state.realizedPnl;

            checks.risk = {
                status: 'PASS',
                detail: `entries=${entries.length}, openPositions=${openPositions}, realized=$${realizedPnl.toFixed(2)}`,
            };
        } catch (err) {
            checks.risk = {
                status: 'FAIL',
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
            };
        }
    } else {
        checks.risk = { status: 'FAIL', error: 'Supabase not configured' };
    }

    // ── Accounting ───────────────────────────────────────────────────────
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            const summary = await loadDailySummary(supabase, today);
            tradeCount = summary.tradeCount;

            checks.accounting = {
                status: 'PASS',
                detail: `trades=${tradeCount}, pnl=$${summary.realizedPnl.toFixed(2)}, symbols=${summary.symbols.join(',')}`,
            };
        } catch (err) {
            checks.accounting = {
                status: 'FAIL',
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
            };
        }
    } else {
        checks.accounting = { status: 'FAIL', error: 'Supabase not configured' };
    }

    // ── Aggregate ────────────────────────────────────────────────────────
    const allPass = Object.values(checks).every((c) => c.status === 'PASS');

    let nextAction: string;
    if (tradeCount === 0 && openPositions === 0 && realizedPnl === 0) {
        nextAction = 'WAITING_FOR_FIRST_TRADE';
    } else if (openPositions > 0) {
        nextAction = 'TRADE_OPEN';
    } else if (realizedPnl !== 0) {
        nextAction = 'TRADE_CLOSED';
    } else {
        nextAction = 'WAITING_FOR_FIRST_TRADE';
    }

    return NextResponse.json({
        status: allPass ? 'PASS' : 'FAIL',
        date: today,
        checks,
        nextAction,
        checkedAt: new Date().toISOString(),
    });
}
