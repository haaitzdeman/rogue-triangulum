-- Risk Enforcement Normalization
-- Adds risk_dollars (computed normalized risk) and is_draft (skip enforcement) to both journals

-- ── Premarket ────────────────────────────────────────────────────────────────
ALTER TABLE premarket_journal_entries
  ADD COLUMN IF NOT EXISTS risk_dollars NUMERIC,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_premarket_journal_date_draft
  ON premarket_journal_entries(effective_date, is_draft);

COMMENT ON COLUMN premarket_journal_entries.risk_dollars IS 'Computed normalized risk in dollars for this entry';
COMMENT ON COLUMN premarket_journal_entries.is_draft IS 'Draft entries are not counted toward open position limits';

-- ── Options ──────────────────────────────────────────────────────────────────
ALTER TABLE options_journal_entries
  ADD COLUMN IF NOT EXISTS risk_dollars NUMERIC,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_options_journal_created_draft
  ON options_journal_entries(created_at, is_draft);

COMMENT ON COLUMN options_journal_entries.risk_dollars IS 'Computed normalized risk in dollars for this entry';
COMMENT ON COLUMN options_journal_entries.is_draft IS 'Draft entries are not counted toward open position limits';
