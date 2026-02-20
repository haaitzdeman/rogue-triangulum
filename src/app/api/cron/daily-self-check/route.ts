export const dynamic = 'force-dynamic';

/**
 * Daily Self-Check — Automated Health + Invariant Validation
 *
 * POST /api/cron/daily-self-check
 *
 * Runs daily to validate system health and critical invariants:
 *   1. Env health (required vars configured)
 *   2. Broker health (Alpaca reachable, account ACTIVE)
 *   3. Ledger invariants (no duplicates, EXITED entries have ledger rows)
 *   4. Draft exclusion from risk
 *
 * Security:
 *   - CRON_SECRET via Authorization: Bearer header → 404 if invalid
 *   - Feature flag: CRON_DAILY_CHECK_ENABLED=true
 *
 * Writes verdict to ops_daily_checks for historical tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/ops/cron-auth';
import { acquireLock, releaseLock } from '@/lib/ops/job-lock';
import { writeJobRun, writeDailyCheck } from '@/lib/ops/job-run-store';
import { isAlpacaConfigured, getAccount } from '@/lib/broker/alpaca-client';
import {
    isServerSupabaseConfigured,
    createServerSupabase,
} from '@/lib/supabase/server';

const JOB_NAME = 'daily-self-check';
const LOCK_TTL = 60; // 1 minute

interface CheckResult {
    name: string;
    pass: boolean;
    detail?: string;
}

export async function GET(request: NextRequest) {
    // ── Auth ──────────────────────────────────────────────────────────────
    const auth = validateCronRequest(request, 'CRON_DAILY_CHECK_ENABLED');
    if (!auth.authorized) return new NextResponse(null, { status: 404 });

    const startedAt = new Date().toISOString();

    // ── Lock ─────────────────────────────────────────────────────────────
    const lock = await acquireLock(JOB_NAME, LOCK_TTL);
    if (!lock.acquired) {
        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'skipped_locked',
        }).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            outcome: 'skipped_locked',
            reason: lock.reason,
        });
    }

    const checks: CheckResult[] = [];
    const reasons: string[] = [];

    try {
        // ── 1. Env health ────────────────────────────────────────────────
        const requiredEnvVars = [
            'NEXT_PUBLIC_SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'ALPACA_API_KEY',
            'ALPACA_API_SECRET',
        ];
        const missingEnv = requiredEnvVars.filter(v => !process.env[v]);
        checks.push({
            name: 'ENV_HEALTH',
            pass: missingEnv.length === 0,
            detail: missingEnv.length === 0 ? 'All required vars set' : `Missing: ${missingEnv.join(', ')}`,
        });
        if (missingEnv.length > 0) reasons.push(`Missing env vars: ${missingEnv.join(', ')}`);

        // ── 2. Broker health ─────────────────────────────────────────────
        const alpacaCfg = isAlpacaConfigured();
        if (alpacaCfg.hasApiKey && alpacaCfg.hasApiSecret) {
            try {
                const account = await getAccount();
                const isActive = account.status === 'ACTIVE';
                checks.push({
                    name: 'BROKER_HEALTH',
                    pass: isActive,
                    detail: `status=${account.status}`,
                });
                if (!isActive) reasons.push(`Broker account status: ${account.status}`);
            } catch (err) {
                const msg = err instanceof Error ? err.message.slice(0, 100) : 'Unknown';
                checks.push({ name: 'BROKER_HEALTH', pass: false, detail: msg });
                reasons.push(`Broker unreachable: ${msg}`);
            }
        } else {
            checks.push({ name: 'BROKER_HEALTH', pass: false, detail: 'Keys not configured' });
            reasons.push('Broker keys not configured');
        }

        // ── 3. DB + Invariant checks ─────────────────────────────────────
        if (isServerSupabaseConfigured()) {
            const supabase = createServerSupabase();

            // 3a. Ledger duplicate check: count entries with duplicate entry_id
            try {
                const { data: dupeData, error: dupeErr } = await supabase
                    .from('trade_ledger')
                    .select('entry_id')
                    .limit(500);

                if (dupeErr) {
                    checks.push({ name: 'LEDGER_NO_DUPES', pass: false, detail: dupeErr.message.slice(0, 100) });
                    reasons.push('Ledger dupe check query failed');
                } else {
                    const entryIds = (dupeData ?? []).map((r: { entry_id: string }) => r.entry_id);
                    const seen = new Set<string>();
                    const dupes: string[] = [];
                    for (const id of entryIds) {
                        if (seen.has(id)) dupes.push(id);
                        seen.add(id);
                    }
                    const hasDupes = dupes.length > 0;
                    checks.push({
                        name: 'LEDGER_NO_DUPES',
                        pass: !hasDupes,
                        detail: hasDupes ? `Duplicate entry_ids: ${dupes.slice(0, 5).join(', ')}` : `${entryIds.length} entries, 0 duplicates`,
                    });
                    if (hasDupes) reasons.push(`Ledger has ${dupes.length} duplicate entry_ids`);
                }
            } catch (err) {
                checks.push({ name: 'LEDGER_NO_DUPES', pass: false, detail: String(err).slice(0, 100) });
                reasons.push('Ledger dupe check exception');
            }

            // 3b. EXITED entries have ledger rows (or ledger_write_failed=true)
            try {
                // Get EXITED entries from journal
                const { data: exitedEntries, error: exitedErr } = await supabase
                    .from('premarket_journal_entries')
                    .select('id, ledger_write_failed')
                    .eq('status', 'EXITED')
                    .limit(500);

                if (exitedErr) {
                    checks.push({ name: 'EXITED_HAS_LEDGER', pass: false, detail: exitedErr.message.slice(0, 100) });
                    reasons.push('Exited-has-ledger check query failed');
                } else if (!exitedEntries || exitedEntries.length === 0) {
                    checks.push({
                        name: 'EXITED_HAS_LEDGER',
                        pass: true,
                        detail: 'No EXITED entries to validate',
                    });
                } else {
                    // Get ledger entry_ids
                    const { data: ledgerData } = await supabase
                        .from('trade_ledger')
                        .select('entry_id')
                        .limit(500);

                    const ledgerEntryIds = new Set(
                        (ledgerData ?? []).map((r: { entry_id: string }) => r.entry_id)
                    );

                    const missing: string[] = [];
                    for (const entry of exitedEntries as { id: string; ledger_write_failed?: boolean }[]) {
                        if (!ledgerEntryIds.has(entry.id) && !entry.ledger_write_failed) {
                            missing.push(entry.id);
                        }
                    }

                    checks.push({
                        name: 'EXITED_HAS_LEDGER',
                        pass: missing.length === 0,
                        detail: missing.length === 0
                            ? `${exitedEntries.length} EXITED entries all have ledger rows`
                            : `${missing.length} EXITED entries missing ledger: ${missing.slice(0, 3).join(', ')}`,
                    });
                    if (missing.length > 0) {
                        reasons.push(`${missing.length} EXITED entries missing ledger rows`);
                    }
                }
            } catch (err) {
                checks.push({ name: 'EXITED_HAS_LEDGER', pass: false, detail: String(err).slice(0, 100) });
                reasons.push('Exited-has-ledger check exception');
            }

            // 3c. Drafts excluded from risk (DRAFT entries should not be EXITED)
            try {
                const { data: draftData, error: draftErr } = await supabase
                    .from('premarket_journal_entries')
                    .select('id, status')
                    .eq('is_draft', true)
                    .eq('status', 'EXITED')
                    .limit(10);

                if (draftErr) {
                    checks.push({ name: 'DRAFTS_EXCLUDED', pass: false, detail: draftErr.message.slice(0, 100) });
                    reasons.push('Draft exclusion check failed');
                } else {
                    const badDrafts = draftData?.length ?? 0;
                    checks.push({
                        name: 'DRAFTS_EXCLUDED',
                        pass: badDrafts === 0,
                        detail: badDrafts === 0 ? 'No drafts in EXITED status' : `${badDrafts} drafts have EXITED status`,
                    });
                    if (badDrafts > 0) reasons.push(`${badDrafts} drafts incorrectly in EXITED status`);
                }
            } catch (err) {
                checks.push({ name: 'DRAFTS_EXCLUDED', pass: false, detail: String(err).slice(0, 100) });
                reasons.push('Draft exclusion check exception');
            }
        } else {
            checks.push({ name: 'DB_CONFIGURED', pass: false, detail: 'Server Supabase not configured' });
            reasons.push('Server Supabase not configured');
        }

        // ── Verdict ──────────────────────────────────────────────────────
        const verdict = checks.every(c => c.pass) ? 'PASS' : 'FAIL';

        // Write daily check record
        await writeDailyCheck({
            runId: lock.runId,
            verdict,
            reasons,
            detailsJson: { checks },
        }).catch(() => { });

        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'ran',
        }).catch(() => { });

        await releaseLock(JOB_NAME, lock.runId).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            verdict,
            reasons,
            checks,
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';

        await writeJobRun({
            runId: lock.runId,
            jobName: JOB_NAME,
            startedAt,
            outcome: 'error',
            errorSummary: msg,
        }).catch(() => { });

        await releaseLock(JOB_NAME, lock.runId, msg).catch(() => { });

        return NextResponse.json({
            run_id: lock.runId,
            verdict: 'FAIL',
            reasons: [`Self-check error: ${msg}`],
            checks,
        }, { status: 500 });
    }
}
