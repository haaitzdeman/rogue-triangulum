-- =============================================================================
-- Add ledger_write_failed flag to journal tables
--
-- When reconciliation marks an entry as EXITED but the immutable ledger write
-- fails, this flag is set to TRUE so the failure is visible and auditable.
--
-- Defensive: only alters tables that exist in the current schema.
-- =============================================================================

ALTER TABLE premarket_journal_entries
  ADD COLUMN IF NOT EXISTS ledger_write_failed boolean DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'options_journal_entries') THEN
    ALTER TABLE options_journal_entries
      ADD COLUMN IF NOT EXISTS ledger_write_failed boolean DEFAULT false;
  END IF;
END $$;
