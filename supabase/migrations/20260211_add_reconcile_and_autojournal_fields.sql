-- Migration: Add auto-reconcile and auto-journal fields
-- Adds columns for: fill linking, manual override protection, audit trail, run tracking

-- =============================================================================
-- premarket_journal_entries
-- =============================================================================

ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS entry_fill_id TEXT,
ADD COLUMN IF NOT EXISTS exit_fill_id TEXT,
ADD COLUMN IF NOT EXISTS system_update_reason TEXT,
ADD COLUMN IF NOT EXISTS run_id TEXT,
ADD COLUMN IF NOT EXISTS pnl_dollars NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC(8,4),
ADD COLUMN IF NOT EXISTS r_multiple NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IS NULL OR result IN ('WIN', 'LOSS', 'BREAKEVEN'));

CREATE INDEX IF NOT EXISTS idx_journal_run_id ON premarket_journal_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_fill_id ON premarket_journal_entries(entry_fill_id);

COMMENT ON COLUMN premarket_journal_entries.manual_override IS 'When true, auto-reconcile will not overwrite exit fields';
COMMENT ON COLUMN premarket_journal_entries.entry_fill_id IS 'broker_trade_id of the matched entry fill';
COMMENT ON COLUMN premarket_journal_entries.exit_fill_id IS 'broker_trade_id of the matched exit fill';
COMMENT ON COLUMN premarket_journal_entries.system_update_reason IS 'Audit trail for automated updates (e.g. auto-reconcile:sync-batch-xxx)';
COMMENT ON COLUMN premarket_journal_entries.run_id IS 'Morning-run ID that created this entry (auto-journal)';
COMMENT ON COLUMN premarket_journal_entries.pnl_dollars IS 'Computed profit/loss in dollars';
COMMENT ON COLUMN premarket_journal_entries.pnl_percent IS 'Computed profit/loss as percentage';
COMMENT ON COLUMN premarket_journal_entries.r_multiple IS 'Risk/reward multiple (requires stop loss)';
COMMENT ON COLUMN premarket_journal_entries.result IS 'Trade result: WIN, LOSS, or BREAKEVEN';

-- =============================================================================
-- options_journal_entries
-- =============================================================================

ALTER TABLE options_journal_entries
ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS entry_fill_id TEXT,
ADD COLUMN IF NOT EXISTS exit_fill_id TEXT,
ADD COLUMN IF NOT EXISTS system_update_reason TEXT,
ADD COLUMN IF NOT EXISTS run_id TEXT,
ADD COLUMN IF NOT EXISTS exit_price DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pnl_dollars NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC(8,4),
ADD COLUMN IF NOT EXISTS r_multiple NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IS NULL OR result IN ('WIN', 'LOSS', 'BREAKEVEN'));

CREATE INDEX IF NOT EXISTS idx_options_journal_run_id ON options_journal_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_options_journal_entry_fill_id ON options_journal_entries(entry_fill_id);

COMMENT ON COLUMN options_journal_entries.manual_override IS 'When true, auto-reconcile will not overwrite exit fields';
COMMENT ON COLUMN options_journal_entries.entry_fill_id IS 'broker_trade_id of the matched entry fill';
COMMENT ON COLUMN options_journal_entries.exit_fill_id IS 'broker_trade_id of the matched exit fill';
COMMENT ON COLUMN options_journal_entries.system_update_reason IS 'Audit trail for automated updates';
COMMENT ON COLUMN options_journal_entries.run_id IS 'Morning-run ID that created this entry (auto-journal)';
