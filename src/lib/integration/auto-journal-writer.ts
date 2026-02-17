/**
 * Auto-Journal Writer
 *
 * Creates PLANNED journal entries from morning-run opportunities.
 * Handles dedup via signal_id to prevent duplicate entries for
 * the same symbol/date/runId combination.
 *
 * Pure logic for generating insert rows + Supabase integration for dedup check.
 */

import { untypedFrom } from '@/lib/supabase/untyped';

// =============================================================================
// Types
// =============================================================================

export interface Opportunity {
    symbol: string;
    rank?: number;
    score?: number;
    direction?: string;
    playType?: string;
    confidence?: string;
    gapPct?: number;
    because?: string;
    keyLevels?: Record<string, unknown>;
    invalidation?: string;
    riskNote?: string;
    analogStats?: Record<string, unknown>;
    recommendedTrade?: {
        type?: string;
        strike?: number;
        expiration?: string;
        contractSymbol?: string;
        mid?: number;
    } | null;
    sizing?: {
        riskMode?: string;
        riskValue?: number;
        accountSize?: number;
        suggestedShares?: number;
        suggestedContracts?: number;
    } | null;
}

export interface AutoJournalConfig {
    runId: string;
    date: string;
    scoreThreshold: number;
    journalType: 'premarket' | 'options';
}

export interface AutoJournalResult {
    created: number;
    skipped: number;
    errors: string[];
}

// =============================================================================
// Signal ID Generation
// =============================================================================

/**
 * Generate deterministic signal ID for dedup.
 * Format: {date}:{symbol}:{runId}
 */
function makeSignalId(date: string, symbol: string, runId: string): string {
    return `${date}:${symbol.toUpperCase()}:${runId}`;
}

// =============================================================================
// Auto-Journal Writer
// =============================================================================

/**
 * Create PLANNED journal entries from opportunities above score threshold.
 * Deduplicates by signal_id — will not create duplicates for same date/symbol/runId.
 */
export async function writeAutoJournalEntries(
    opportunities: Opportunity[],
    config: AutoJournalConfig,
): Promise<AutoJournalResult> {
    const { runId, date, scoreThreshold, journalType } = config;
    const result: AutoJournalResult = { created: 0, skipped: 0, errors: [] };

    // Filter by score threshold
    const qualifying = opportunities.filter(o => (o.score ?? 0) >= scoreThreshold);

    if (qualifying.length === 0) return result;

    // Build signal IDs for dedup check
    const signalIds = qualifying.map(o => makeSignalId(date, o.symbol, runId));

    // Check which signal IDs already exist
    const table = journalType === 'options' ? 'options_journal_entries' : 'premarket_journal_entries';
    const { data: existing } = await untypedFrom(table)
        .select('signal_id')
        .in('signal_id', signalIds);

    const existingSet = new Set((existing ?? []).map((e: { signal_id: string }) => e.signal_id));

    for (const opp of qualifying) {
        const signalId = makeSignalId(date, opp.symbol, runId);

        // Dedup: skip if already exists
        if (existingSet.has(signalId)) {
            result.skipped++;
            continue;
        }

        try {
            if (journalType === 'premarket') {
                await insertPremarketEntry(opp, signalId, date, runId);
            } else {
                await insertOptionsEntry(opp, signalId, date, runId);
            }
            result.created++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${opp.symbol}: ${msg.slice(0, 100)}`);
        }
    }

    return result;
}

// =============================================================================
// Insert Helpers
// =============================================================================

async function insertPremarketEntry(
    opp: Opportunity,
    signalId: string,
    date: string,
    runId: string,
): Promise<void> {
    const entry = {
        effective_date: date,
        symbol: opp.symbol.toUpperCase(),
        gap_pct: opp.gapPct ?? 0,
        direction: opp.direction ?? 'UP',
        play_type: opp.playType ?? 'CONTINUATION',
        confidence: opp.confidence ?? 'LOW',
        low_confidence: opp.confidence === 'LOW',
        because: opp.because ?? `Auto-journal from morning run ${runId}`,
        key_levels: opp.keyLevels ?? {},
        invalidation: opp.invalidation ?? 'N/A',
        risk_note: opp.riskNote ?? 'Auto-generated from morning run',
        analog_stats: opp.analogStats ?? {},
        scan_generated_at: new Date().toISOString(),
        config_used: { source: 'MORNING_RUN', runId },
        status: 'OPEN',
        signal_id: signalId,
        signal_snapshot: opp,
        run_id: runId,
        system_update_reason: `auto-journal:${runId}`,
        // Sizing fields (if provided)
        ...(opp.sizing ? {
            risk_mode: opp.sizing.riskMode,
            risk_value: opp.sizing.riskValue,
            account_size: opp.sizing.accountSize,
            size: opp.sizing.suggestedShares,
        } : {}),
    };

    const { error } = await untypedFrom('premarket_journal_entries').insert(entry);
    if (error) throw new Error(error.message);
}

async function insertOptionsEntry(
    opp: Opportunity,
    signalId: string,
    date: string,
    runId: string,
): Promise<void> {
    const entry = {
        signal_id: signalId,
        symbol: opp.symbol.toUpperCase(),
        strategy_suggestion: opp.recommendedTrade?.type ?? 'LONG_CALL',
        iv_rank_value: null,
        iv_rank_classification: null,
        expected_move: 0,
        liquidity_score: 0,
        rationale: opp.because ?? `Auto-journal from morning run ${runId}`,
        underlying_price: 0,
        scanned_at: new Date().toISOString(),
        status: 'PLANNED',
        selected_contract: opp.recommendedTrade ? {
            symbol: opp.recommendedTrade.contractSymbol,
            strike: opp.recommendedTrade.strike,
            expiration: opp.recommendedTrade.expiration,
            mid: opp.recommendedTrade.mid,
        } : null,
        signal_snapshot: opp,
        run_id: runId,
        system_update_reason: `auto-journal:${runId}`,
    };

    const { error } = await untypedFrom('options_journal_entries').insert(entry);
    if (error) throw new Error(error.message);
}
