import { SupabaseClient } from '@supabase/supabase-js';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';

export interface NextActionInstruction {
    nextAction: string;
    why: string;
    requiredHumanAction: string | null;
    suggestedEndpointToRun: string | null;
}

export interface FirstTradeCheckResult {
    ok: boolean;
    reasons: string[];
    nextAction?: string;
    details?: unknown;
}

export interface ComputeNextActionParams {
    now: Date;
    marketClock: {
        isMarketOpen: boolean;
        isExtendedHours: boolean;
        nextOpenET: string;
    };
    hasFirstTradeProcessed: boolean;
    firstTradeReasons: string[];
    firstTradeAction?: string; // Bubbled up nextAction from the unlock check
    cronCapability: string;
    lastJobRuns: Record<string, unknown>;
    lastDailyCheck: unknown;
    isSupabaseConfigured: boolean;
}

/**
 * Validates that at least one paper trade has fully traversed the system:
 * 1. EXITED Journal Entry
 * 2. Immutable Trade Ledger Row
 * 3. Daily Accounting Summary Inclusion
 * 4. Risk state is implied to use ledger authority if summary works, but we verify 1-3 explicitly.
 */
export async function computeFirstTradeProcessed(supabase: SupabaseClient | null): Promise<FirstTradeCheckResult> {
    const reasons: string[] = [];

    if (!supabase) {
        reasons.push('Supabase not configured');
        return { ok: false, reasons, nextAction: 'CONFIGURE_SUPABASE' };
    }

    try {
        let entryId: string | null = null;
        let exitTimestamp: string | null = null;
        let symbol: string | null = null;

        // 1. Find an EXITED entry
        const { data: premarket } = await supabase
            .from('premarket_journal_entries')
            .select('id, symbol, updated_at')
            .eq('status', 'EXITED')
            .limit(1)
            .maybeSingle();

        if (premarket) {
            entryId = premarket.id;
            symbol = premarket.symbol;
            exitTimestamp = premarket.updated_at;
        } else {
            const { data: options } = await supabase
                .from('options_journal_entries')
                .select('id, symbol, updated_at')
                .eq('status', 'EXITED')
                .limit(1)
                .maybeSingle();
            if (options) {
                entryId = options.id;
                symbol = options.symbol;
                exitTimestamp = options.updated_at;
            }
        }

        if (!entryId || !exitTimestamp) {
            reasons.push('No EXITED journal entries found. A complete trade lifecycle is required.');
            return { ok: false, reasons, nextAction: 'WAITING_FOR_FIRST_TRADE' };
        }

        // 2. Check trade_ledger
        const { data: ledgerRow, error: ledgerErr } = await supabase
            .from('trade_ledger')
            .select('*')
            .eq('entry_id', entryId)
            .limit(1)
            .maybeSingle();

        if (ledgerErr) throw ledgerErr;

        if (!ledgerRow) {
            reasons.push(`Journal entry ${entryId} is EXITED, but no corresponding trade_ledger row exists.`);
            reasons.push('Run the /api/cron/post-close job to reconcile and write to ledger.');
            return { ok: false, reasons, nextAction: 'RUN_POST_CLOSE' };
        }

        // 3. Check accounting daily summary
        const exitDate = ledgerRow.exit_timestamp.slice(0, 10);
        const summary = await loadDailySummary(supabase, exitDate);

        if (summary.tradeCount === 0) {
            reasons.push(`Accounting summary for ${exitDate} has 0 trades despite ledger row existing.`);
            return { ok: false, reasons, nextAction: 'INVESTIGATE_DEGRADED' };
        }

        if (!summary.symbols.includes(ledgerRow.symbol)) {
            reasons.push(`Accounting summary for ${exitDate} does not include symbol ${ledgerRow.symbol}.`);
            return { ok: false, reasons, nextAction: 'INVESTIGATE_DEGRADED' };
        }

        return {
            ok: true,
            reasons: [],
            nextAction: 'SYSTEM_OPERATIONAL',
            details: { entryId, symbol, ledgerRowId: ledgerRow.id, dailySummary: summary }
        };

    } catch (err) {
        reasons.push(`Internal error during check: ${err instanceof Error ? err.message : 'Unknown'}`);
        return { ok: false, reasons, nextAction: 'INVESTIGATE_DEGRADED' };
    }
}

/**
 * Pure function to determine the exact single NextAction for the operator.
 */
export function computeNextAction(params: ComputeNextActionParams): NextActionInstruction {
    // 1. Degraded flags take highest priority
    const degradedFlags: string[] = [];
    for (const jobName of ['intraday-sync', 'post-close', 'daily-self-check', 'broker-sync']) {
        const run = params.lastJobRuns[jobName] as { outcome?: string } | undefined;
        if (run?.outcome === 'error') degradedFlags.push(`${jobName}_error`);
    }
    const check = params.lastDailyCheck as { verdict?: string } | null;
    if (check?.verdict === 'FAIL') degradedFlags.push('daily_check_failed');

    if (degradedFlags.length > 0) {
        return {
            nextAction: 'INVESTIGATE_DEGRADED',
            why: `System has degraded flags: ${degradedFlags.join(', ')}`,
            requiredHumanAction: 'Investigate errors in job-run-store or daily checks.',
            suggestedEndpointToRun: '/api/dev/health'
        };
    }

    // 2. First Trade checks
    if (!params.hasFirstTradeProcessed) {
        const action = params.firstTradeAction;

        if (action === 'CONFIGURE_SUPABASE' || !params.isSupabaseConfigured) {
            return {
                nextAction: 'CONFIGURE_SUPABASE',
                why: 'Supabase environment variables are missing.',
                requiredHumanAction: 'Add Supabase URLs and Keys to Vercel/Local env.',
                suggestedEndpointToRun: '/api/dev/env-health'
            };
        }

        if (action === 'WAITING_FOR_FIRST_TRADE') {
            if (!params.marketClock.isMarketOpen && !params.marketClock.isExtendedHours) {
                return {
                    nextAction: 'WAIT_FOR_MARKET_OPEN',
                    why: `Market is closed. First trade cannot be placed. Next open: ${params.marketClock.nextOpenET}`,
                    requiredHumanAction: 'Wait for market hours.',
                    suggestedEndpointToRun: null
                };
            } else {
                return {
                    nextAction: 'PLACE_FIRST_TRADE',
                    why: 'System needs a complete paper trade lifecycle (buy, sync, sell, sync).',
                    requiredHumanAction: 'Place a paper trade in Alpaca dashboard.',
                    suggestedEndpointToRun: '/api/dev/smoke/guided-first-trade'
                };
            }
        }

        if (action === 'RUN_POST_CLOSE') {
            return {
                nextAction: 'RUN_POST_CLOSE',
                why: 'Trade exited, but ledger reconciliation is missing.',
                requiredHumanAction: 'Run the post-close cron manually (or wait for it) to reconcile ledger.',
                suggestedEndpointToRun: '/api/cron/post-close?force=true'
            };
        }

        // Fallback for first trade fail
        return {
            nextAction: action || 'INVESTIGATE_DEGRADED',
            why: params.firstTradeReasons.join(' ') || 'Unlock check failed for unknown reasons.',
            requiredHumanAction: 'Investigate the exact reasons returned.',
            suggestedEndpointToRun: '/api/dev/smoke/first-trade-unlock-check'
        };
    }

    // 3. Operational
    return {
        nextAction: 'SYSTEM_OPERATIONAL',
        why: 'First trade unlock is passed and no degraded flags detected.',
        requiredHumanAction: null,
        suggestedEndpointToRun: null
    };
}
