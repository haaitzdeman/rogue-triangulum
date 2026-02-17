-- Migration: Add outcome tracking fields to premarket_journal_entries
-- Adds signal ID, trade details, and computed outcome fields

-- Add signal_id column for deterministic signal linking
ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS signal_id TEXT;

-- Add signal snapshot (full signal data for replay)
ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS signal_snapshot JSONB;

-- Add trade direction (long/short, separate from gap direction)
ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS trade_direction TEXT CHECK (trade_direction IS NULL OR trade_direction IN ('LONG', 'SHORT'));

-- Add trade execution fields
ALTER TABLE premarket_journal_entries
ADD COLUMN IF NOT EXISTS entry_price NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS exit_price NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS size NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ;

-- Create index on signal_id for duplicate detection
CREATE INDEX IF NOT EXISTS idx_journal_signal_id ON premarket_journal_entries(signal_id);

-- Comments
COMMENT ON COLUMN premarket_journal_entries.signal_id IS 'Deterministic hash: date+symbol+gapPct+config';
COMMENT ON COLUMN premarket_journal_entries.signal_snapshot IS 'Full signal data at time of save';
COMMENT ON COLUMN premarket_journal_entries.trade_direction IS 'Trade direction: LONG or SHORT';
COMMENT ON COLUMN premarket_journal_entries.entry_price IS 'Trade entry price';
COMMENT ON COLUMN premarket_journal_entries.exit_price IS 'Trade exit price';
COMMENT ON COLUMN premarket_journal_entries.size IS 'Position size (shares or dollars)';
COMMENT ON COLUMN premarket_journal_entries.entry_time IS 'Trade entry timestamp';
COMMENT ON COLUMN premarket_journal_entries.exit_time IS 'Trade exit timestamp';
