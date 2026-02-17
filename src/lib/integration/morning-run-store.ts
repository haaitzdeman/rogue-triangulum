/**
 * Morning Run Store — Supabase-backed persistence
 *
 * Replaces filesystem storage (data/morning-run/{date}/{runId}.json)
 * with durable DB storage via the morning_run_runs table.
 *
 * All functions accept a SupabaseClient (server service-role) to avoid
 * coupling to module-level singletons.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface MorningRunMeta {
    preferLive: boolean;
    force: boolean;
    maxSymbols: number;
    autoJournal: boolean;
    autoJournalThreshold?: number | null;
    riskBlocked: boolean;
    riskReason?: string | null;
}

export interface MorningRunSummary {
    runId: string;
    runDate: string;
    generatedAt: string;
    riskBlocked: boolean;
    autoJournal: boolean;
    candidateCount: number;
    optionsCompleted: number;
    opportunityCount: number;
}

// =============================================================================
// Save (upsert)
// =============================================================================

export async function saveMorningRun(params: {
    supabase: SupabaseClient;
    runId: string;
    runDate: string;
    generatedAt: string;
    meta: MorningRunMeta;
    payload: unknown;
}): Promise<void> {
    const { supabase, runId, runDate, generatedAt, meta, payload } = params;

    const row = {
        run_id: runId,
        run_date: runDate,
        generated_at: generatedAt,
        prefer_live: meta.preferLive,
        force: meta.force,
        max_symbols: meta.maxSymbols,
        auto_journal: meta.autoJournal,
        auto_journal_threshold: meta.autoJournalThreshold ?? null,
        risk_blocked: meta.riskBlocked,
        risk_reason: meta.riskReason ?? null,
        payload,
    };

    const { error } = await supabase
        .from('morning_run_runs')
        .upsert(row, { onConflict: 'run_id' });

    if (error) {
        console.error('[MorningRunStore] saveMorningRun error:', error);
        throw new Error(`Failed to save morning run: ${error.message}`);
    }
}

// =============================================================================
// Load by runId
// =============================================================================

export async function loadMorningRunByRunId(
    supabase: SupabaseClient,
    runId: string,
): Promise<unknown | null> {
    const { data, error } = await supabase
        .from('morning_run_runs')
        .select('payload, run_date')
        .eq('run_id', runId)
        .single();

    if (error) {
        // PGRST116 = no rows found (not a real error)
        if (error.code === 'PGRST116') return null;
        console.error('[MorningRunStore] loadMorningRunByRunId error:', error);
        throw new Error(`Failed to load morning run: ${error.message}`);
    }

    return data ? { payload: data.payload, runDate: data.run_date } : null;
}

// =============================================================================
// List by date
// =============================================================================

export async function listMorningRunsByDate(
    supabase: SupabaseClient,
    runDate: string,
    limit = 25,
): Promise<MorningRunSummary[]> {
    const { data, error } = await supabase
        .from('morning_run_runs')
        .select('run_id, run_date, generated_at, risk_blocked, auto_journal, payload')
        .eq('run_date', runDate)
        .order('generated_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[MorningRunStore] listMorningRunsByDate error:', error);
        throw new Error(`Failed to list morning runs: ${error.message}`);
    }

    return (data ?? []).map((row) => {
        const p = row.payload as Record<string, unknown> | null;
        const premarket = p?.premarket as Record<string, unknown> | undefined;
        const options = p?.options as Record<string, unknown> | undefined;
        const today = p?.today as Record<string, unknown> | undefined;

        return {
            runId: row.run_id,
            runDate: row.run_date,
            generatedAt: row.generated_at,
            riskBlocked: row.risk_blocked,
            autoJournal: row.auto_journal,
            candidateCount: (premarket?.candidateCount as number) ?? 0,
            optionsCompleted: (options?.completed as number) ?? 0,
            opportunityCount: (today?.opportunityCount as number) ?? 0,
        };
    });
}

// =============================================================================
// Purge (admin)
// =============================================================================

export async function purgeMorningRunsBefore(
    supabase: SupabaseClient,
    cutoffDate: string,
): Promise<number> {
    const { data, error } = await supabase
        .from('morning_run_runs')
        .delete()
        .lt('run_date', cutoffDate)
        .select('id');

    if (error) {
        console.error('[MorningRunStore] purgeMorningRunsBefore error:', error);
        throw new Error(`Failed to purge morning runs: ${error.message}`);
    }

    return data?.length ?? 0;
}
