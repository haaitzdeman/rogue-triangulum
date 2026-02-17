-- Migration: Add scale in/out + reconciliation transparency fields
-- Supports: reconcile_status, match_explanation, avg price, partial exits

-- =============================================================================
-- premarket_journal_entries
-- =============================================================================

ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS reconcile_status TEXT
    CHECK (reconcile_status IS NULL OR reconcile_status IN
        ('MATCHED', 'PARTIAL', 'AMBIGUOUS', 'BLOCKED_MANUAL_OVERRIDE', 'NONE')),
ADD COLUMN IF NOT EXISTS match_explanation JSONB,
ADD COLUMN IF NOT EXISTS avg_entry_price NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS total_qty NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS exited_qty NUMERIC(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS realized_pnl_dollars NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS unrealized_pnl_dollars NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_journal_reconcile_status
    ON premarket_journal_entries(reconcile_status);

COMMENT ON COLUMN premarket_journal_entries.reconcile_status IS 'MATCHED|PARTIAL|AMBIGUOUS|BLOCKED_MANUAL_OVERRIDE|NONE';
COMMENT ON COLUMN premarket_journal_entries.match_explanation IS 'Array of match rule strings for transparency';
COMMENT ON COLUMN premarket_journal_entries.avg_entry_price IS 'VWAP across scale-in fills';
COMMENT ON COLUMN premarket_journal_entries.total_qty IS 'Total entered quantity across fills';
COMMENT ON COLUMN premarket_journal_entries.exited_qty IS 'Qty closed so far (partial exits)';
COMMENT ON COLUMN premarket_journal_entries.realized_pnl_dollars IS 'PnL from closed portions';
COMMENT ON COLUMN premarket_journal_entries.unrealized_pnl_dollars IS 'PnL on open remainder (nullable)';
