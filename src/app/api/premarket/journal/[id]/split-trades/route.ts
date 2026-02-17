/**
 * Split Trades API Route
 *
 * POST /api/premarket/journal/[id]/split-trades
 *
 * Admin-only: Creates a new journal entry for the reversed portion of a trade.
 * Sets manual_override=true on both entries.
 *
 * Body: { splitAtQty: number } — how many shares belong to original trade
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth/admin-gate';
import { untypedFrom } from '@/lib/supabase/untyped';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    // Admin gate
    const auth = checkAdminAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { success: false, error: auth.reason || 'Unauthorized' },
            { status: 401 },
        );
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json(
            { success: false, error: 'Missing entry ID' },
            { status: 400 },
        );
    }

    let body: { splitAtQty: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 },
        );
    }

    if (!body.splitAtQty || body.splitAtQty <= 0) {
        return NextResponse.json(
            { success: false, error: 'splitAtQty must be a positive number' },
            { status: 400 },
        );
    }

    // Fetch the original entry
    const { data: original, error: fetchError } = await untypedFrom('premarket_journal_entries')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !original) {
        return NextResponse.json(
            { success: false, error: 'Entry not found' },
            { status: 404 },
        );
    }

    const origEntry = original as Record<string, unknown>;

    // Create new entry for reversed portion
    const newId = uuidv4();
    const splitQty = body.splitAtQty;
    const totalQty = (origEntry.total_qty as number) || (origEntry.size as number) || 0;
    const remainingQty = totalQty - splitQty;

    if (remainingQty <= 0) {
        return NextResponse.json(
            { success: false, error: `splitAtQty (${splitQty}) >= totalQty (${totalQty})` },
            { status: 400 },
        );
    }

    // Determine reversed direction
    const origDirection = (origEntry.trade_direction as string) || 'LONG';
    const reversedDirection = origDirection === 'LONG' ? 'SHORT' : 'LONG';

    const newEntry = {
        id: newId,
        symbol: origEntry.symbol,
        effective_date: origEntry.effective_date,
        status: 'ENTERED', // Reversed portion is still open
        trade_direction: reversedDirection,
        entry_price: origEntry.exit_price || origEntry.entry_price,
        size: remainingQty,
        total_qty: remainingQty,
        source: 'SPLIT',
        manual_override: true,
        system_update_reason: `split-from:${id}:${new Date().toISOString()}`,
        reconcile_status: 'BLOCKED_MANUAL_OVERRIDE',
        match_explanation: [`Split from entry ${id}`, `Reversed portion: ${remainingQty} shares ${reversedDirection}`],
        user_note: origEntry.user_note || null,
        data_mode: origEntry.data_mode || 'PREMARKET',
    };

    // Insert new entry
    const { error: insertError } = await untypedFrom('premarket_journal_entries')
        .insert(newEntry);

    if (insertError) {
        return NextResponse.json(
            { success: false, error: insertError.message.slice(0, 200) },
            { status: 500 },
        );
    }

    // Update original entry: lock it and set correct qty
    const { error: updateError } = await untypedFrom('premarket_journal_entries')
        .update({
            manual_override: true,
            total_qty: splitQty,
            size: splitQty,
            reconcile_status: 'BLOCKED_MANUAL_OVERRIDE',
            match_explanation: [
                ...(Array.isArray(origEntry.match_explanation) ? origEntry.match_explanation : []),
                `Split: kept ${splitQty} shares, reversed ${remainingQty} → ${newId}`,
            ],
            system_update_reason: `split-original:${newId}:${new Date().toISOString()}`,
        })
        .eq('id', id);

    if (updateError) {
        return NextResponse.json(
            { success: false, error: updateError.message.slice(0, 200) },
            { status: 500 },
        );
    }

    return NextResponse.json({
        success: true,
        originalEntryId: id,
        newEntryId: newId,
        originalQty: splitQty,
        reversedQty: remainingQty,
        reversedDirection,
    });
}
