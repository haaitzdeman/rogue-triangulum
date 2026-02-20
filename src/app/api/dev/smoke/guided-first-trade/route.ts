export const dynamic = 'force-dynamic';

/**
 * Guided First Trade — Market-Hours Aware
 *
 * POST /api/dev/smoke/guided-first-trade
 *
 * Admin-gated, READ-ONLY — NEVER trades or writes.
 *
 * Returns step-by-step guidance for executing a first paper trade,
 * adapting to current market hours:
 *
 *   - Market OPEN → standard market order guidance
 *   - Extended hours → extended-hours LIMIT order guidance
 *   - Market CLOSED → returns next open time + wait message
 *
 * Returns:
 *   404 — not admin
 *   200 — { status, clock, guidance, checks, nextAction }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { getMarketClock } from '@/lib/market/market-hours';
import { isAlpacaConfigured, getAccount } from '@/lib/broker/alpaca-client';
import {
    isServerSupabaseConfigured,
    createServerSupabase,
} from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';

interface CheckResult {
    name: string;
    pass: boolean;
    detail?: string;
    error?: string;
}

interface OrderGuidance {
    orderType: 'market' | 'limit';
    timeInForce: string;
    extendedHours: boolean;
    notes: string[];
}

export async function POST(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const clock = getMarketClock();
    const checks: CheckResult[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // ── Broker Check ─────────────────────────────────────────────────────
    const alpacaCfg = isAlpacaConfigured();
    if (alpacaCfg.hasApiKey && alpacaCfg.hasApiSecret) {
        try {
            const account = await getAccount();
            checks.push({
                name: 'BROKER',
                pass: account.status === 'ACTIVE',
                detail: `status=${account.status}`,
            });
        } catch (err) {
            checks.push({
                name: 'BROKER',
                pass: false,
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
            });
        }
    } else {
        checks.push({
            name: 'BROKER',
            pass: false,
            error: 'Alpaca keys not configured',
        });
    }

    // ── Trade History Check ──────────────────────────────────────────────
    let tradeCount = 0;
    if (isServerSupabaseConfigured()) {
        try {
            const supabase = createServerSupabase();
            const summary = await loadDailySummary(supabase, today);
            tradeCount = summary.tradeCount;
            checks.push({
                name: 'TRADE_HISTORY',
                pass: true,
                detail: `${tradeCount} trades today`,
            });
        } catch (err) {
            checks.push({
                name: 'TRADE_HISTORY',
                pass: false,
                error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
            });
        }
    } else {
        checks.push({
            name: 'TRADE_HISTORY',
            pass: false,
            error: 'Supabase not configured',
        });
    }

    // ── Market Hours Check ───────────────────────────────────────────────
    checks.push({
        name: 'MARKET_CLOCK',
        pass: true, // Informational, always passes
        detail: `open=${clock.isMarketOpen}, extended=${clock.isExtendedHours}, session=${clock.extendedSession ?? 'NONE'}`,
    });

    // ── Build Guidance ───────────────────────────────────────────────────
    const allChecksPass = checks.every((c) => c.pass);
    let guidance: OrderGuidance | null = null;
    let message: string;
    let nextAction: string;

    if (!allChecksPass) {
        message = 'Pre-flight checks failed. Fix issues before trading.';
        nextAction = 'FIX_CHECKS';
    } else if (clock.isMarketOpen) {
        // Regular hours — simple market order
        message = 'Market is OPEN. You can place a standard market order.';
        nextAction = tradeCount === 0 ? 'PLACE_FIRST_TRADE' : 'TRADE_ACTIVE';
        guidance = {
            orderType: 'market',
            timeInForce: 'day',
            extendedHours: false,
            notes: [
                'Use a small position size for your first paper trade (e.g. 1-5 shares)',
                'Pick a liquid stock: AAPL, MSFT, SPY, QQQ',
                'Place order in Alpaca Paper Dashboard → Trading',
                'After fill, run: POST /api/broker/alpaca/sync',
            ],
        };
    } else if (clock.isExtendedHours) {
        // Extended hours — limit order required
        const session = clock.extendedSession === 'PRE_MARKET'
            ? 'Pre-Market (4:00 AM – 9:30 AM ET)'
            : 'Post-Market (4:00 PM – 8:00 PM ET)';
        message = `Extended hours active: ${session}. Use a LIMIT order with extended_hours=true.`;
        nextAction = tradeCount === 0 ? 'PLACE_FIRST_TRADE_EXTENDED' : 'TRADE_ACTIVE';
        guidance = {
            orderType: 'limit',
            timeInForce: 'day',
            extendedHours: true,
            notes: [
                `Current session: ${session}`,
                'Extended-hours orders MUST be LIMIT orders (not market)',
                'Set limit_price close to current bid/ask for quick fill',
                'Alpaca API: { "type": "limit", "time_in_force": "day", "extended_hours": true, "limit_price": "..." }',
                'After fill, run: POST /api/broker/alpaca/sync',
            ],
        };
    } else {
        // Market closed
        message = `Market is CLOSED. Next open: ${clock.nextOpenET}. Wait until then or use extended hours (4:00 AM – 8:00 PM ET weekdays).`;
        nextAction = 'WAIT_FOR_MARKET_OPEN';
        guidance = null;
    }

    return NextResponse.json({
        status: allChecksPass ? 'PASS' : 'FAIL',
        date: today,
        clock: {
            nowET: clock.nowET,
            isMarketOpen: clock.isMarketOpen,
            isExtendedHours: clock.isExtendedHours,
            extendedSession: clock.extendedSession,
            nextOpenET: clock.nextOpenET,
            nextCloseET: clock.nextCloseET,
        },
        message,
        guidance,
        checks,
        nextAction,
        checkedAt: new Date().toISOString(),
    });
}
