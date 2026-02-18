export const dynamic = 'force-dynamic';

/**
 * Premarket Journal API Route
 * 
 * GET /api/premarket/journal - List all entries (newest first)
 * POST /api/premarket/journal - Create new entry from candidate
 * 
 * Uses Supabase table: premarket_journal_entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';

// Use untyped client for premarket_journal_entries table (pending type regeneration)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// =============================================================================
// Types
// =============================================================================

interface _JournalEntry {
    id?: string;
    created_at?: string;
    effective_date: string;
    symbol: string;
    gap_pct: number;
    direction: string;
    play_type: string;
    confidence: string;
    low_confidence: boolean;
    because: string;
    key_levels: Json;
    invalidation: string;
    risk_note: string;
    analog_stats: Json;
    scan_generated_at: string;
    config_used: Json;
    user_note?: string | null;
    status?: string;
    outcome?: Json | null;
}

interface CreateEntryPayload {
    effectiveDate: string;
    symbol: string;
    gapPct: number;
    direction: 'UP' | 'DOWN';
    playType: 'CONTINUATION' | 'FADE' | 'AVOID';
    confidence: 'HIGH' | 'LOW';
    lowConfidence: boolean;
    because: string;
    keyLevels: Record<string, unknown>;
    invalidation: string;
    riskNote: string;
    analogStats: Record<string, unknown>;
    scanGeneratedAt: string;
    configUsed: Record<string, unknown>;
    userNote?: string;
    resolved?: {
        mode: string;
        effectiveDate: string;
    };
    // Risk / sizing
    isDraft?: boolean;
    riskMode?: string | null;
    riskValue?: number | null;
    accountSize?: number | null;
    entryPrice?: number | null;
    stopPrice?: number | null;
    totalQty?: number | null;
    size?: number | null;
}

// =============================================================================
// Handlers
// =============================================================================

export async function GET() {
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
        console.log('[Premarket Journal API] GET - fetching entries...');
        console.log('[Premarket Journal API] Supabase URL configured:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);

        const { data, error } = await supabase
            .from('premarket_journal_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        console.log('[Premarket Journal API] Query complete. Error:', error, 'Data count:', data?.length);

        if (error) {
            console.error('[Premarket Journal API] Supabase error:', error);

            // Check if table doesn't exist (migration not run)
            if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
                return NextResponse.json(
                    {
                        success: false,
                        errorCode: 'TABLE_NOT_FOUND',
                        message: 'Journal table not found. Please run the migration: supabase/migrations/20260131_create_premarket_journal.sql',
                    },
                    { status: 503 }
                );
            }

            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATABASE_ERROR',
                    message: error.message,
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entries: data ?? [],
            count: data?.length ?? 0,
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

export async function POST(request: NextRequest) {
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
        const body = await request.json() as CreateEntryPayload;

        // Validate required fields
        const requiredFields = [
            'effectiveDate', 'symbol', 'gapPct', 'direction', 'playType',
            'confidence', 'because', 'keyLevels', 'invalidation', 'riskNote',
            'analogStats', 'scanGeneratedAt', 'configUsed'
        ];
        const missing = requiredFields.filter(f => !(f in body));
        if (missing.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    message: `Missing required fields: ${missing.join(', ')}`,
                },
                { status: 400 }
            );
        }

        // === RISK GUARDRAIL ===
        const isDraft = body.isDraft ?? true; // default draft for auto-generated entries without sizing

        // Compute risk_dollars
        const { computeRiskDollars } = await import('@/lib/risk/risk-normalizer');
        const riskResult = computeRiskDollars({
            desk: 'PREMARKET',
            risk_mode: body.riskMode ?? null,
            risk_value: body.riskValue ?? null,
            account_size: body.accountSize ?? null,
            is_draft: isDraft,
            entry_price: body.entryPrice ?? null,
            stop_price: body.stopPrice ?? null,
            total_qty: body.totalQty ?? null,
            size: body.size ?? null,
        });

        // Non-draft with active status must have risk_dollars
        if (!isDraft && riskResult.riskDollars == null) {
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

        // Skip duplicate/limit checks for draft entries
        if (!isDraft) {
            try {
                const { computeDailyRiskState, isDuplicateLivePosition, canOpenNewPosition } = await import('@/lib/risk/risk-engine');
                const { getRiskConfig } = await import('@/lib/risk/risk-config');
                const riskConfig = getRiskConfig();
                const today = body.effectiveDate;

                const { data: openEntries } = await supabase
                    .from('premarket_journal_entries')
                    .select('id, symbol, status, entry_price, exit_price, size, total_qty, realized_pnl_dollars, trade_direction, is_draft, risk_dollars')
                    .eq('effective_date', today);

                const riskEntries = (openEntries || []).map((e: Record<string, unknown>) => ({
                    id: e.id as string,
                    symbol: e.symbol as string,
                    status: e.status as string,
                    entry_price: e.entry_price as number | null,
                    exit_price: e.exit_price as number | null,
                    size: e.size as number | null,
                    total_qty: e.total_qty as number | null,
                    realized_pnl_dollars: e.realized_pnl_dollars as number | null,
                    trade_direction: e.trade_direction as string,
                    is_draft: (e.is_draft as boolean) ?? false,
                    risk_dollars: e.risk_dollars as number | null,
                }));

                // Check duplicate
                if (isDuplicateLivePosition(body.symbol, riskEntries, riskConfig.duplicatePositionScope, 'PREMARKET')) {
                    return NextResponse.json(
                        {
                            success: false,
                            errorCode: 'RISK_BLOCKED',
                            message: `Duplicate live position: ${body.symbol} already has an active entry today`,
                        },
                        { status: 409 },
                    );
                }

                // Check daily + position limits
                const riskState = computeDailyRiskState(riskEntries, riskConfig);
                const canOpen = canOpenNewPosition({
                    config: riskConfig,
                    currentDailyPnl: riskState.totalPnl,
                    openPositions: riskState.openPositions,
                    proposedRisk: riskResult.riskDollars ?? 0,
                    dailyLossLimitBreached: riskState.dailyLossLimitBreached,
                });

                if (!canOpen.allowed) {
                    return NextResponse.json(
                        {
                            success: false,
                            errorCode: 'RISK_BLOCKED',
                            message: canOpen.reason || 'Risk check failed',
                        },
                        { status: 409 },
                    );
                }
            } catch (riskErr) {
                console.error('[Premarket Journal] Risk check error (proceeding):', riskErr);
            }
        }

        // Generate deterministic signal ID
        const { generateSignalId } = await import('@/lib/premarket/signal-utils');
        const signalId = generateSignalId(
            body.effectiveDate,
            body.symbol,
            body.gapPct,
            body.configUsed
        );

        // Build signal snapshot for replay
        const signalSnapshot = {
            symbol: body.symbol,
            gapPct: body.gapPct,
            direction: body.direction,
            playType: body.playType,
            confidence: body.confidence,
            lowConfidence: body.lowConfidence ?? false,
            because: body.because,
            analogStats: body.analogStats,
            keyLevels: body.keyLevels,
            invalidation: body.invalidation,
            riskNote: body.riskNote,
            configUsed: body.configUsed,
            resolved: body.resolved,
        };

        // Map to database column names
        const entry = {
            signal_id: signalId,
            signal_snapshot: signalSnapshot as Json,
            effective_date: body.effectiveDate,
            symbol: body.symbol,
            gap_pct: body.gapPct,
            direction: body.direction,
            play_type: body.playType,
            confidence: body.confidence,
            low_confidence: body.lowConfidence ?? false,
            because: body.because,
            key_levels: body.keyLevels as Json,
            invalidation: body.invalidation,
            risk_note: body.riskNote,
            analog_stats: body.analogStats as Json,
            scan_generated_at: body.scanGeneratedAt,
            config_used: body.configUsed as Json,
            user_note: body.userNote ?? null,
            status: 'OPEN',
            outcome: null,
            is_draft: isDraft,
            risk_dollars: riskResult.riskDollars ?? null,
            // Trade fields initialized as null
            trade_direction: null,
            entry_price: null,
            exit_price: null,
            size: null,
            entry_time: null,
            exit_time: null,
        };


        const { data, error } = await supabase
            .from('premarket_journal_entries')
            .insert(entry)
            .select()
            .single();

        if (error) {
            console.error('[Premarket Journal API] Supabase insert error:', error);
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATABASE_ERROR',
                    message: error.message,
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entry: data,
        }, { status: 201 });
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
