-- =============================================================================
-- Production Indexes + Constraints
--
-- Performance and safety indexes for production workloads.
-- All use IF NOT EXISTS for idempotent re-runs.
-- =============================================================================

-- morning_run_runs: unique run_id + date lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_morning_run_runs_run_id
    ON morning_run_runs (run_id);

CREATE INDEX IF NOT EXISTS idx_morning_run_runs_date
    ON morning_run_runs (run_date DESC);

-- trade_ledger: UNIQUE entry_id for idempotency
-- Drop existing non-unique index first, then create unique version
DROP INDEX IF EXISTS idx_trade_ledger_entry_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_ledger_entry_id_unique
    ON trade_ledger (entry_id);

-- trade_ledger: desk + exit_timestamp for accounting queries
CREATE INDEX IF NOT EXISTS idx_trade_ledger_desk_exit
    ON trade_ledger (desk, exit_timestamp DESC);

-- premarket_journal_entries: date + symbol lookup
CREATE INDEX IF NOT EXISTS idx_pje_date_symbol
    ON premarket_journal_entries (effective_date, symbol);

-- premarket_journal_entries: find failed ledger writes (partial index)
CREATE INDEX IF NOT EXISTS idx_pje_ledger_failed
    ON premarket_journal_entries (ledger_write_failed) WHERE ledger_write_failed = true;
