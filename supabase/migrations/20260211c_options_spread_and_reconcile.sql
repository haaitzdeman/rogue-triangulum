-- Migration: Options spread + reconciliation fields
-- Adds multi-leg support and reconcile transparency to options_journal_entries

ALTER TABLE options_journal_entries
ADD COLUMN IF NOT EXISTS is_spread BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS legs_json JSONB,
ADD COLUMN IF NOT EXISTS net_debit_credit NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS max_loss_estimate NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS max_profit_estimate NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS reconcile_status TEXT
    CHECK (reconcile_status IS NULL OR reconcile_status IN
        ('MATCHED', 'PARTIAL', 'AMBIGUOUS', 'AMBIGUOUS_REVERSAL', 'BLOCKED_MANUAL_OVERRIDE', 'NONE')),
ADD COLUMN IF NOT EXISTS match_explanation JSONB,
ADD COLUMN IF NOT EXISTS entry_fill_id TEXT,
ADD COLUMN IF NOT EXISTS exit_fill_id TEXT,
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS avg_entry_price NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS total_qty NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS exited_qty NUMERIC(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS realized_pnl_dollars NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS system_update_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_options_journal_reconcile_status
    ON options_journal_entries(reconcile_status);

-- Also add AMBIGUOUS_REVERSAL to premarket check constraint (extend existing)
ALTER TABLE premarket_journal_entries
DROP CONSTRAINT IF EXISTS premarket_journal_entries_reconcile_status_check;

ALTER TABLE premarket_journal_entries
ADD CONSTRAINT premarket_journal_entries_reconcile_status_check
    CHECK (reconcile_status IS NULL OR reconcile_status IN
        ('MATCHED', 'PARTIAL', 'AMBIGUOUS', 'AMBIGUOUS_REVERSAL', 'BLOCKED_MANUAL_OVERRIDE', 'NONE'));
