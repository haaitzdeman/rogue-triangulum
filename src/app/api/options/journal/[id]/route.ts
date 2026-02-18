export const dynamic = 'force-dynamic';

/**
 * Options Journal Entry API Route
 *
 * PATCH /api/options/journal/[id] - Update entry status, notes, sizing, draft
 *
 * Uses Supabase table: options_journal_entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface UpdatePayload {
    status?: 'PLANNED' | 'ENTERED' | 'EXITED' | 'CANCELED';
    user_note?: string | null;
    execution_notes?: string | null;
    review_notes?: string | null;
    // Position sizing
    account_size?: number | null;
    risk_mode?: 'CONTRACTS' | 'RISK_DOLLARS' | 'RISK_PERCENT' | null;
    risk_value?: number | null;
    // Draft
    is_draft?: boolean;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        // Build update object (only include provided fields)
        const updates: Record<string, unknown> = {};

        if ('status' in body) updates.status = body.status;
        if ('user_note' in body) updates.user_note = body.user_note;
        if ('execution_notes' in body) updates.execution_notes = body.execution_notes;
        if ('review_notes' in body) updates.review_notes = body.review_notes;
        if ('account_size' in body) updates.account_size = body.account_size;
        if ('risk_mode' in body) updates.risk_mode = body.risk_mode;
        if ('risk_value' in body) updates.risk_value = body.risk_value;
        if ('is_draft' in body) updates.is_draft = body.is_draft;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    message: 'No fields to update.',
                },
                { status: 400 }
            );
        }

        // ── Risk normalization ──────────────────────────────────
        const { data: current, error: fetchErr } = await supabase
            .from('options_journal_entries')
            .select('status, is_draft, risk_mode, risk_value, account_size, selected_contract, strategy_suggestion')
            .eq('id', id)
            .single();

        if (!fetchErr && current) {
            const mergedStatus = body.status ?? current.status;
            const mergedDraft = body.is_draft ?? (current.is_draft as boolean) ?? false;
            const activeStatuses = ['PLANNED', 'ENTERED'];

            // Recompute risk_dollars from merged fields
            const { computeRiskDollars } = await import('@/lib/risk/risk-normalizer');
            const contract = current.selected_contract as Record<string, unknown> | null;
            const contractMid = contract?.mid as number ?? null;

            const riskResult = computeRiskDollars({
                desk: 'OPTIONS',
                risk_mode: body.risk_mode ?? current.risk_mode as string,
                risk_value: body.risk_value ?? current.risk_value as number,
                account_size: body.account_size ?? current.account_size as number,
                is_draft: mergedDraft,
                contract_mid: contractMid,
                contracts: body.risk_value ?? current.risk_value as number,
                strategy_type: current.strategy_suggestion as string,
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

        const { data, error } = await supabase
            .from('options_journal_entries')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[Options Journal API] Supabase update error:', error);
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
        });
    } catch (error) {
        console.error('[Options Journal API] Error:', error);
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
