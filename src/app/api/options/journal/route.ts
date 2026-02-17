/**
 * Options Journal API Route
 *
 * GET /api/options/journal — list all options journal entries (newest first)
 * POST /api/options/journal — create new entry from scan result
 *
 * Uses Supabase table: options_journal_entries
 * Reuses same infrastructure as premarket journal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// =============================================================================
// Types
// =============================================================================

interface OptionsJournalPayload {
    symbol: string;
    strategySuggestion: string;
    ivRank: {
        rank: number | null;
        classification: string | null;
        lowData: boolean;
    };
    expectedMove: {
        expectedMove: number;
        expectedRange: { low: number; high: number };
    };
    liquidityScore: number;
    rationale: string;
    underlyingPrice: number;
    scannedAt: string;

    /** Optional: selected contract details */
    selectedContract?: {
        symbol: string;
        strike: number;
        expiration: string;
        type: 'CALL' | 'PUT';
        bid: number;
        ask: number;
        mid: number;
    } | null;

    /** User-provided fields */
    status?: 'PLANNED' | 'ENTERED' | 'EXITED' | 'CANCELED';
    executionNotes?: string;
    reviewNotes?: string;
    userNote?: string;
    /** Position sizing */
    accountSize?: number | null;
    riskMode?: 'CONTRACTS' | 'RISK_DOLLARS' | 'RISK_PERCENT' | null;
    riskValue?: number | null;
    /** Draft */
    isDraft?: boolean;
}

// =============================================================================
// GET — List entries
// =============================================================================

export async function GET() {
    if (!isSupabaseConfigured()) {
        return NextResponse.json(
            {
                success: false,
                errorCode: 'SUPABASE_NOT_CONFIGURED',
                message: 'Supabase is not configured. Journal features require Supabase.',
            },
            { status: 503 },
        );
    }

    try {
        const { data, error } = await supabase
            .from('options_journal_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('[Options Journal] Supabase error:', error);

            if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
                return NextResponse.json(
                    {
                        success: false,
                        errorCode: 'TABLE_NOT_FOUND',
                        message: 'Options journal table not found. Run migration: supabase/migrations/20260207_create_options_journal.sql',
                    },
                    { status: 503 },
                );
            }

            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATABASE_ERROR',
                    message: error.message,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            entries: data ?? [],
            count: data?.length ?? 0,
        });
    } catch (error) {
        console.error('[Options Journal] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}

// =============================================================================
// POST — Create entry
// =============================================================================

export async function POST(request: NextRequest) {
    if (!isSupabaseConfigured()) {
        return NextResponse.json(
            {
                success: false,
                errorCode: 'SUPABASE_NOT_CONFIGURED',
                message: 'Supabase is not configured. Journal features require Supabase.',
            },
            { status: 503 },
        );
    }

    try {
        const body = await request.json() as OptionsJournalPayload;

        // Validate required fields
        const requiredFields = ['symbol', 'strategySuggestion', 'ivRank', 'expectedMove', 'liquidityScore', 'rationale', 'scannedAt'];
        const missing = requiredFields.filter(f => !(f in body));
        if (missing.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    message: `Missing required fields: ${missing.join(', ')}`,
                },
                { status: 400 },
            );
        }

        // === RISK GUARDRAIL ===
        const isDraft = body.isDraft ?? false;

        // Compute risk_dollars
        const { computeRiskDollars } = await import('@/lib/risk/risk-normalizer');
        const contractMid = body.selectedContract?.mid ?? null;
        const riskResult = computeRiskDollars({
            desk: 'OPTIONS',
            risk_mode: body.riskMode ?? 'CONTRACTS',
            risk_value: body.riskValue ?? null,
            account_size: body.accountSize ?? null,
            is_draft: isDraft,
            contract_mid: contractMid,
            contracts: body.riskValue ?? null,
            strategy_type: body.strategySuggestion ?? null,
        });

        // Non-draft must have risk_dollars
        if (!isDraft && riskResult.riskDollars == null) {
            const status = body.status ?? 'PLANNED';
            const activeStatuses = ['PLANNED', 'ENTERED'];
            if (activeStatuses.includes(status.toUpperCase())) {
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

        // Skip duplicate/limit checks for draft entries
        if (!isDraft) {
            try {
                const { computeDailyRiskState, isDuplicateLivePosition, canOpenNewPosition } = await import('@/lib/risk/risk-engine');
                const { getRiskConfig } = await import('@/lib/risk/risk-config');
                const riskConfig = getRiskConfig();
                const today = body.scannedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

                const { data: openEntries } = await supabase
                    .from('options_journal_entries')
                    .select('id, symbol, status, realized_pnl_dollars, is_draft, risk_dollars')
                    .gte('created_at', `${today}T00:00:00`);

                const riskEntries = (openEntries || []).map((e: Record<string, unknown>) => ({
                    id: e.id as string,
                    symbol: e.symbol as string,
                    status: e.status as string,
                    realized_pnl_dollars: e.realized_pnl_dollars as number | null,
                    is_draft: (e.is_draft as boolean) ?? false,
                    risk_dollars: e.risk_dollars as number | null,
                }));

                // Check duplicate
                if (isDuplicateLivePosition(body.symbol, riskEntries, riskConfig.duplicatePositionScope, 'OPTIONS')) {
                    return NextResponse.json(
                        {
                            success: false,
                            errorCode: 'RISK_BLOCKED',
                            message: `Duplicate live position: ${body.symbol} already has an active options entry`,
                        },
                        { status: 409 },
                    );
                }

                // Check daily limits
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
                console.error('[Options Journal] Risk check error (proceeding):', riskErr);
            }
        }


        // Generate deterministic signal ID
        const { generateOptionsSignalId } = await import('@/lib/options/signal-utils');
        const signalId = generateOptionsSignalId(
            body.scannedAt.slice(0, 10),
            body.symbol,
            body.strategySuggestion,
            body.ivRank?.rank ?? null,
        );

        // Build snapshot for replay
        const signalSnapshot = {
            symbol: body.symbol,
            strategySuggestion: body.strategySuggestion,
            ivRank: body.ivRank,
            expectedMove: body.expectedMove,
            liquidityScore: body.liquidityScore,
            rationale: body.rationale,
            underlyingPrice: body.underlyingPrice,
            selectedContract: body.selectedContract ?? null,
        };

        const entry = {
            signal_id: signalId,
            signal_snapshot: signalSnapshot,
            symbol: body.symbol.toUpperCase(),
            strategy_suggestion: body.strategySuggestion,
            iv_rank_value: body.ivRank?.rank ?? null,
            iv_rank_classification: body.ivRank?.classification ?? null,
            expected_move: body.expectedMove?.expectedMove ?? 0,
            liquidity_score: body.liquidityScore,
            rationale: body.rationale,
            underlying_price: body.underlyingPrice,
            scanned_at: body.scannedAt,
            selected_contract: body.selectedContract ?? null,
            status: body.status ?? 'PLANNED',
            execution_notes: body.executionNotes ?? null,
            review_notes: body.reviewNotes ?? null,
            user_note: body.userNote ?? null,
            account_size: body.accountSize ?? null,
            risk_mode: body.riskMode ?? null,
            risk_value: body.riskValue ?? null,
            is_draft: isDraft,
            risk_dollars: riskResult.riskDollars ?? null,
        };

        const { data, error } = await supabase
            .from('options_journal_entries')
            .insert(entry)
            .select()
            .single();

        if (error) {
            console.error('[Options Journal] Insert error:', error);

            if (error.message?.includes('duplicate key') || error.code === '23505') {
                return NextResponse.json(
                    {
                        success: false,
                        errorCode: 'DUPLICATE_SIGNAL',
                        message: `Signal already exists: ${signalId}`,
                    },
                    { status: 409 },
                );
            }

            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATABASE_ERROR',
                    message: error.message,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            entry: data,
            signalId,
        }, { status: 201 });
    } catch (error) {
        console.error('[Options Journal] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
