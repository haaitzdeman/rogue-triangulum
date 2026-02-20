/**
 * Job Run Store — Ops Job Execution History
 *
 * CRUD for ops_job_runs and ops_daily_checks tables.
 * All cron jobs write a run record for observability.
 */

import { untypedFrom } from '@/lib/supabase/untyped';

// =============================================================================
// Types
// =============================================================================

export type JobOutcome = 'ran' | 'skipped_locked' | 'skipped_closed' | 'error';

export interface WriteJobRunParams {
    runId: string;
    jobName: string;
    startedAt: string;
    outcome: JobOutcome;
    fillsPulled?: number;
    tradesAdvanced?: number;
    ledgerRowsWritten?: number;
    errorSummary?: string;
}

export interface WriteDailyCheckParams {
    runId: string;
    verdict: 'PASS' | 'FAIL';
    reasons: string[];
    detailsJson: Record<string, unknown>;
}

export interface JobRun {
    run_id: string;
    job_name: string;
    started_at: string;
    finished_at: string | null;
    outcome: JobOutcome;
    fills_pulled: number;
    trades_advanced: number;
    ledger_rows_written: number;
    error_summary: string | null;
}

export interface DailyCheck {
    run_id: string;
    verdict: 'PASS' | 'FAIL';
    reasons: string[];
    details_json: Record<string, unknown>;
    checked_at: string;
}

// =============================================================================
// Write
// =============================================================================

/**
 * Write a job run record to ops_job_runs.
 */
export async function writeJobRun(params: WriteJobRunParams): Promise<void> {
    const { error } = await untypedFrom('ops_job_runs')
        .insert({
            run_id: params.runId,
            job_name: params.jobName,
            started_at: params.startedAt,
            finished_at: new Date().toISOString(),
            outcome: params.outcome,
            fills_pulled: params.fillsPulled ?? 0,
            trades_advanced: params.tradesAdvanced ?? 0,
            ledger_rows_written: params.ledgerRowsWritten ?? 0,
            error_summary: params.errorSummary?.slice(0, 500) ?? null,
        });

    if (error) {
        console.error('[JobRunStore] writeJobRun error:', error.message.slice(0, 200));
    }
}

/**
 * Write a daily check verdict to ops_daily_checks.
 */
export async function writeDailyCheck(params: WriteDailyCheckParams): Promise<void> {
    const { error } = await untypedFrom('ops_daily_checks')
        .insert({
            run_id: params.runId,
            verdict: params.verdict,
            reasons: params.reasons,
            details_json: params.detailsJson,
            checked_at: new Date().toISOString(),
        });

    if (error) {
        console.error('[JobRunStore] writeDailyCheck error:', error.message.slice(0, 200));
    }
}

// =============================================================================
// Read
// =============================================================================

/**
 * Get the latest job run for each job name.
 */
export async function getLatestJobRuns(): Promise<Record<string, JobRun>> {
    const { data, error } = await untypedFrom('ops_job_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

    if (error || !data) return {};

    // Group by job_name, keep only the latest per job
    const result: Record<string, JobRun> = {};
    for (const row of data as JobRun[]) {
        if (!result[row.job_name]) {
            result[row.job_name] = row;
        }
    }
    return result;
}

/**
 * Get the latest daily check verdict.
 */
export async function getLatestDailyCheck(): Promise<DailyCheck | null> {
    const { data, error } = await untypedFrom('ops_daily_checks')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data as DailyCheck;
}
