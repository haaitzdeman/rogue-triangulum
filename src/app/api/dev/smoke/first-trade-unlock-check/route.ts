import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { isServerSupabaseConfigured, createServerSupabase } from '@/lib/supabase/server';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';
import { getMarketClock } from '@/lib/market/market-hours';
import { computeFirstTradeProcessed } from '@/lib/ops/next-action';

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
    const result = await computeFirstTradeProcessed(supabase);

    if (!result.ok) {
        return NextResponse.json({
            status: 'FAIL',
            reasons: result.reasons,
            nextAction: result.nextAction
        });
    }

    return NextResponse.json({
        status: 'PASS',
        reasons: [],
        nextAction: 'SYSTEM_OPERATIONAL',
        details: result.details
    });
}
