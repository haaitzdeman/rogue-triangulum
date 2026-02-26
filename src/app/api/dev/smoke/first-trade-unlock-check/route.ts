import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';
import { getMarketClock } from '@/lib/market/market-hours';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const auth = checkAdminAuth(request);
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const reasons: string[] = [];
    const nextAction = 'WATCHING';

    if (!isServerSupabaseConfigured()) {
        reasons.push('Supabase not configured');
        return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'CONFIGURE_SUPABASE' });
    }

    const supabase = createServerSupabase();

    try {
        // 1) Find an EXITED entry in either premarket or options journal
        let entryId: string | null = null;
        let exitTimestamp: string | null = null;
        let symbol: string | null = null;

        const { data: premarket } = await supabase
            .from('premarket_journal_entries')
            .select('id, symbol, updated_at')
            .eq('status', 'EXITED')
            .limit(1)
            .maybeSingle();

        if (premarket) {
            entryId = premarket.id;
            symbol = premarket.symbol;
            exitTimestamp = premarket.updated_at;
        } else {
            const { data: options } = await supabase
                .from('options_journal_entries')
                .select('id, symbol, updated_at')
                .eq('status', 'EXITED')
                .limit(1)
                .maybeSingle();
            if (options) {
                entryId = options.id;
                symbol = options.symbol;
                exitTimestamp = options.updated_at;
            }
        }

        if (!entryId || !exitTimestamp) {
            reasons.push('No EXITED journal entries found. A complete trade lifecycle is required.');
            return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'WAITING_FOR_FIRST_TRADE' });
        }

        // 2) Check if it exists in trade_ledger
        const { data: ledgerRow, error: ledgerErr } = await supabase
            .from('trade_ledger')
            .select('*')
            .eq('entry_id', entryId)
            .limit(1)
            .maybeSingle();

        if (ledgerErr) throw ledgerErr;

        if (!ledgerRow) {
            reasons.push(`Journal entry ${entryId} is EXITED, but no corresponding trade_ledger row exists.`);
            reasons.push('Run the /api/cron/post-close job to reconcile and write to ledger.');
            return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'RUN_POST_CLOSE' });
        }

        // 3) Check risk/accounting reflection via loadDailySummary
        const exitDate = ledgerRow.exit_timestamp.slice(0, 10);
        const summary = await loadDailySummary(supabase, exitDate);

        if (summary.tradeCount === 0) {
            reasons.push(`Accounting summary for ${exitDate} has 0 trades despite ledger row existing.`);
            return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'INVESTIGATE_DEGRADED' });
        }

        if (!summary.symbols.includes(ledgerRow.symbol)) {
            reasons.push(`Accounting summary for ${exitDate} does not include symbol ${ledgerRow.symbol}.`);
            return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'INVESTIGATE_DEGRADED' });
        }

        // All checks passed
        return NextResponse.json({
            status: 'PASS',
            reasons: [],
            nextAction: 'SYSTEM_OPERATIONAL',
            details: {
                entryId,
                symbol,
                ledgerRowId: ledgerRow.id,
                dailySummary: summary
            }
        });

    } catch (err) {
        reasons.push(`Internal error during check: ${err instanceof Error ? err.message : 'Unknown'}`);
        return NextResponse.json({ status: 'FAIL', reasons, nextAction: 'INVESTIGATE_DEGRADED' });
    }
}
