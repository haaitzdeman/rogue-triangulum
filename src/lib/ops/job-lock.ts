/**
 * Job Lock — DB-backed Advisory Locks for Cron Jobs
 *
 * Uses ops_job_locks table to ensure only one instance of a job runs at a time.
 * Stale locks auto-expire based on TTL.
 *
 * SAFETY:
 * - acquireLock is idempotent: if already locked, returns skipped
 * - releaseLock is safe to call multiple times
 * - expireStaleLocks cleans up crashed jobs
 */

import { untypedFrom } from '@/lib/supabase/untyped';

// =============================================================================
// Types
// =============================================================================

export interface LockResult {
    acquired: boolean;
    runId: string;
    reason?: string;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Attempt to acquire a named job lock.
 *
 * 1. First, expire any stale locks for this job
 * 2. Try INSERT — if row exists with non-expired lock, skip
 * 3. If row exists but expired/released, DELETE then INSERT
 *
 * @returns { acquired: true, runId } or { acquired: false, reason }
 */
export async function acquireLock(
    jobName: string,
    ttlSeconds: number = 120,
): Promise<LockResult> {
    const runId = `${jobName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Step 1: Check for existing lock
    const { data: existing } = await untypedFrom('ops_job_locks')
        .select('job_name, run_id, expires_at, released_at')
        .eq('job_name', jobName)
        .limit(1)
        .maybeSingle();

    if (existing) {
        const existingExpiry = new Date(existing.expires_at);
        const isReleased = !!existing.released_at;
        const isExpired = existingExpiry <= now;

        if (!isReleased && !isExpired) {
            // Lock is active — skip
            return {
                acquired: false,
                runId: existing.run_id,
                reason: `Lock held by ${existing.run_id}, expires at ${existing.expires_at}`,
            };
        }

        // Lock is stale or released — delete it
        await untypedFrom('ops_job_locks')
            .delete()
            .eq('job_name', jobName);
    }

    // Step 2: Insert new lock
    const { error } = await untypedFrom('ops_job_locks')
        .insert({
            job_name: jobName,
            run_id: runId,
            acquired_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            released_at: null,
            last_error: null,
        });

    if (error) {
        // Race condition: another process grabbed it first
        return {
            acquired: false,
            runId,
            reason: `Insert failed (race): ${error.message.slice(0, 100)}`,
        };
    }

    return { acquired: true, runId };
}

/**
 * Release a named job lock by marking it released.
 * Only releases if the run_id matches (prevents releasing someone else's lock).
 */
export async function releaseLock(
    jobName: string,
    runId: string,
    errorMessage?: string,
): Promise<void> {
    await untypedFrom('ops_job_locks')
        .update({
            released_at: new Date().toISOString(),
            last_error: errorMessage?.slice(0, 500) ?? null,
        })
        .eq('job_name', jobName)
        .eq('run_id', runId);
}

/**
 * Expire all stale locks that have passed their expires_at.
 * Returns count of expired locks.
 */
export async function expireStaleLocks(): Promise<{ expired: number }> {
    const now = new Date().toISOString();

    const { data } = await untypedFrom('ops_job_locks')
        .delete()
        .lt('expires_at', now)
        .is('released_at', null)
        .select('job_name');

    return { expired: data?.length ?? 0 };
}
