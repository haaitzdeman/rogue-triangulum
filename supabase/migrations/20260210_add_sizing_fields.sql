-- Position Sizing Fields Migration
-- Adds sizing fields to both premarket and options journal tables
-- All fields are nullable for backward compatibility

ALTER TABLE premarket_journal_entries
  ADD COLUMN IF NOT EXISTS account_size numeric,
  ADD COLUMN IF NOT EXISTS risk_mode text,
  ADD COLUMN IF NOT EXISTS risk_value numeric;

ALTER TABLE options_journal_entries
  ADD COLUMN IF NOT EXISTS account_size numeric,
  ADD COLUMN IF NOT EXISTS risk_mode text,
  ADD COLUMN IF NOT EXISTS risk_value numeric;

-- Comments for documentation
COMMENT ON COLUMN premarket_journal_entries.account_size IS 'Optional account size for position sizing. Used with risk_mode=RISK_PERCENT.';
COMMENT ON COLUMN premarket_journal_entries.risk_mode IS 'Sizing mode: CONTRACTS, RISK_DOLLARS, or RISK_PERCENT';
COMMENT ON COLUMN premarket_journal_entries.risk_value IS 'Value corresponding to risk_mode: number of shares, risk dollars, or risk percent';
COMMENT ON COLUMN options_journal_entries.account_size IS 'Optional account size for position sizing. Used with risk_mode=RISK_PERCENT.';
COMMENT ON COLUMN options_journal_entries.risk_mode IS 'Sizing mode: CONTRACTS, RISK_DOLLARS, or RISK_PERCENT';
COMMENT ON COLUMN options_journal_entries.risk_value IS 'Value corresponding to risk_mode: number of shares/contracts, risk dollars, or risk percent';
