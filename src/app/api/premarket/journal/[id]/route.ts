/**
 * Premarket Journal Entry API Route
 * 
 * PATCH /api/premarket/journal/[id] - Update entry trade details and outcome
 * 
 * Uses Supabase table: premarket_journal_entries
 * 
 * Allowed fields for update (signal data is immutable):
 * - trade_direction, entry_price, exit_price, size, entry_time, exit_time
 * - outcome, user_note, status
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { validateOutcomeUpdate, calculateOutcome, extractRiskPerShare } from '@/lib/brains/premarket';

// Use untyped client for premarket_journal_entries table (pending type regeneration)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface UpdatePayload {
    status?: 'OPEN' | 'CLOSED';
    user_note?: string | null;
    // Trade details
    trade_direction?: 'LONG' | 'SHORT';
    entry_price?: number;
    exit_price?: number;
    size?: number;
    stop_price?: number | null;
    entry_time?: string;
    exit_time?: string;
    // Outcome (can be computed or manual)
    outcome?: {
        pnlDollars?: number;
        pnlPercent?: number;
        rMultiple?: number;
        result?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING';
        notes?: string;
    };
    // Position sizing
    account_size?: number | null;
    risk_mode?: 'CONTRACTS' | 'RISK_DOLLARS' | 'RISK_PERCENT' | 'SHARES' | null;
    risk_value?: number | null;
    // Draft
    is_draft?: boolean;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
        return NextResponse.json(
            {
                success: false,
                errorCode: 'SUPABASE_NOT_CONFIGURED',
                message: 'Supabase is not configured. Journal features require Supabase.',
            },
            { status: 503 }
        );
    }

    try {
        const { id } = await params;
        const body = await request.json() as UpdatePayload;

        // Validate only allowed fields are being updated
        const validation = validateOutcomeUpdate(body as Record<string, unknown>);
        if (!validation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    message: `Cannot modify signal fields: ${validation.disallowedFields.join(', ')}`,
                },
                { status: 400 }
            );
        }

        // Build update object (only include provided fields)
        const updates: Record<string, unknown> = {};

        if ('status' in body) updates.status = body.status;
        if ('user_note' in body) updates.user_note = body.user_note;
        if ('trade_direction' in body) updates.trade_direction = body.trade_direction;
        if ('entry_price' in body) updates.entry_price = body.entry_price;
        if ('exit_price' in body) updates.exit_price = body.exit_price;
        if ('size' in body) updates.size = body.size;
        if ('stop_price' in body) updates.stop_price = body.stop_price;
        if ('entry_time' in body) updates.entry_time = body.entry_time;
        if ('exit_time' in body) updates.exit_time = body.exit_time;
        if ('outcome' in body) updates.outcome = body.outcome;
        // Position sizing fields
        if ('account_size' in body) updates.account_size = body.account_size;
        if ('risk_mode' in body) updates.risk_mode = body.risk_mode;
        if ('risk_value' in body) updates.risk_value = body.risk_value;
        if ('is_draft' in body) updates.is_draft = body.is_draft;

        // ── Risk normalization ──────────────────────────────────
        // Fetch current entry to merge fields for risk calc
        const { data: current, error: fetchErr } = await supabase
            .from('premarket_journal_entries')
            .select('status, entry_price, size, total_qty, is_draft, risk_mode, risk_value, account_size, stop_price')
            .eq('id', id)
            .single();

        if (!fetchErr && current) {
            const mergedStatus = body.status ?? current.status;
            const mergedDraft = body.is_draft ?? (current.is_draft as boolean) ?? false;
            const activeStatuses = ['PLANNED', 'ENTERED', 'OPEN'];

            // Recompute risk_dollars from merged fields
            const { computeRiskDollars } = await import('@/lib/risk/risk-normalizer');
            const riskResult = computeRiskDollars({
                desk: 'PREMARKET',
                risk_mode: body.risk_mode ?? current.risk_mode as string,
                risk_value: body.risk_value ?? current.risk_value as number,
                account_size: body.account_size ?? current.account_size as number,
                is_draft: mergedDraft,
                entry_price: body.entry_price ?? current.entry_price as number,
                stop_price: body.stop_price ?? current.stop_price as number,
                total_qty: current.total_qty as number,
                size: body.size ?? current.size as number,
            });

            updates.risk_dollars = riskResult.riskDollars ?? null;

            // Block non-draft active entries with null risk_dollars
            if (!mergedDraft && activeStatuses.includes(mergedStatus?.toUpperCase?.() ?? '') && riskResult.riskDollars == null) {
                return NextResponse.json(
                    {
                        success: false,
                        errorCode: 'RISK_BLOCKED',
                        message: 'MISSING_RISK_DOLLARS: Non-draft entry requires computable risk. ' +
                            riskResult.explanation.join('; '),
                    },
                    { status: 409 },
                );
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    message: 'No fields to update. See allowed fields in API documentation.',
                },
                { status: 400 }
            );
        }

        // If trade details provided, auto-calculate outcome
        const hasTradeUpdate = body.entry_price !== undefined || body.exit_price !== undefined ||
            body.trade_direction !== undefined || body.size !== undefined;

        if (hasTradeUpdate && !body.outcome) {
            // Fetch current entry to get key_levels for R calculation
            const { data: current, error: fetchError } = await supabase
                .from('premarket_journal_entries')
                .select('key_levels, entry_price, exit_price, trade_direction, size')
                .eq('id', id)
                .single();

            if (!fetchError && current) {
                // Merge current with updates
                const entryPrice = body.entry_price ?? current.entry_price;
                const exitPrice = body.exit_price ?? current.exit_price;
                const direction = body.trade_direction ?? current.trade_direction;
                const size = body.size ?? current.size;

                if (entryPrice && direction && size) {
                    const riskPerShare = extractRiskPerShare(
                        current.key_levels ?? {},
                        entryPrice,
                        direction
                    );

                    const calculatedOutcome = calculateOutcome(
                        { direction, entryPrice, exitPrice, size },
                        riskPerShare
                    );

                    if (calculatedOutcome) {
                        updates.outcome = calculatedOutcome;
                    }
                }
            }
        }

        const { data, error } = await supabase
            .from('premarket_journal_entries')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[Premarket Journal API] Supabase update error:', error);
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATABASE_ERROR',
                    message: error.message,
                },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'NOT_FOUND',
                    message: `Entry with id ${id} not found`,
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            entry: data,
            outcomeAutoCalculated: hasTradeUpdate && !body.outcome,
        });
    } catch (error) {
        console.error('[Premarket Journal API] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
