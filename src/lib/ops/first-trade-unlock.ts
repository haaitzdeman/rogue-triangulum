import { SupabaseClient } from '@supabase/supabase-js';
import { loadDailySummary } from '@/lib/accounting/trade-ledger-store';

export interface FirstTradeUnlockResult {
    ok: boolean;
    reasons: string[];
    sample?: {
        desk: string;
        journalId: string;
        entryId: string;
    };
}

/**
 * Validates that at least one paper trade has fully traversed the system:
 * 1. EXITED Journal Entry across either premarket or options desks
 * 2. Immutable Trade Ledger Row matches entry_id
 * 3. Daily Accounting Summary Inclusion matches entry_id
 */
export async function checkFirstTradeUnlock(supabase: SupabaseClient | null): Promise<FirstTradeUnlockResult> {
    const reasons: string[] = [];

    if (!supabase) {
        reasons.push('Supabase not configured');
        return { ok: false, reasons };
    }

    try {
        let entryId: string | null = null;
        let desk: string | null = null;
        let journalId: string | null = null;

        // 1. Find an EXITED entry
        const { data: premarket } = await supabase
            .from('premarket_journal_entries')
            .select('id, symbol, updated_at')
            .eq('status', 'EXITED')
            .limit(1)
            .maybeSingle();

        if (premarket) {
            journalId = premarket.id;
            entryId = premarket.id; // Usually mapped this way in the system
            desk = 'premarket';
        } else {
            const { data: options } = await supabase
                .from('options_journal_entries')
                .select('id, symbol, updated_at')
                .eq('status', 'EXITED')
                .limit(1)
                .maybeSingle();
            if (options) {
                journalId = options.id;
                entryId = options.id;
                desk = 'options';
            }
        }

        if (!journalId || !entryId || !desk) {
            reasons.push('No EXITED journal entries found. A complete trade lifecycle is required.');
            return { ok: false, reasons };
        }

        // 2. Check trade_ledger matches entry_id
        const { data: ledgerRow, error: ledgerErr } = await supabase
            .from('trade_ledger')
            .select('*')
            .eq('entry_id', entryId)
            .limit(1)
            .maybeSingle();

        if (ledgerErr) throw ledgerErr;

        if (!ledgerRow) {
            reasons.push(`Journal entry ${journalId} is EXITED, but no corresponding trade_ledger row exists.`);
            reasons.push('Run the /api/cron/post-close job to reconcile and write to ledger.');
            return { ok: false, reasons };
        }

        // 3. Check accounting daily summary matches that ledger row
        const exitDate = ledgerRow.exit_timestamp.slice(0, 10);
        const summary = await loadDailySummary(supabase, exitDate);

        if (summary.tradeCount === 0) {
            reasons.push(`Accounting summary for ${exitDate} has 0 trades despite ledger row existing.`);
            return { ok: false, reasons };
        }

        if (!summary.symbols.includes(ledgerRow.symbol)) {
            reasons.push(`Accounting summary for ${exitDate} does not include symbol ${ledgerRow.symbol}.`);
            return { ok: false, reasons };
        }

        return {
            ok: true,
            reasons: [],
            sample: {
                desk,
                journalId,
                entryId
            }
        };

    } catch (err) {
        reasons.push(`Internal error during check: ${err instanceof Error ? err.message : 'Unknown'}`);
        return { ok: false, reasons };
    }
}
