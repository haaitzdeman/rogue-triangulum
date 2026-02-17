-- Options Journal Table
-- Stores journal entries from the options scanner
-- Mirrors premarket_journal_entries pattern but with options-specific fields

CREATE TABLE IF NOT EXISTS options_journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Signal identification (deterministic hash for dedup)
    signal_id TEXT NOT NULL UNIQUE,

    -- Signal snapshot (full scan result for replay)
    signal_snapshot JSONB NOT NULL DEFAULT '{}',

    -- Core fields
    symbol TEXT NOT NULL,
    strategy_suggestion TEXT NOT NULL,
    iv_rank_value DOUBLE PRECISION,
    iv_rank_classification TEXT,
    expected_move DOUBLE PRECISION NOT NULL DEFAULT 0,
    liquidity_score INTEGER NOT NULL DEFAULT 0,
    rationale TEXT NOT NULL DEFAULT '',
    underlying_price DOUBLE PRECISION NOT NULL DEFAULT 0,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Selected contract (optional)
    selected_contract JSONB,

    -- Trade lifecycle
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'ENTERED', 'EXITED', 'CANCELED')),

    -- Notes
    execution_notes TEXT,
    review_notes TEXT,
    user_note TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_options_journal_symbol ON options_journal_entries(symbol);
CREATE INDEX IF NOT EXISTS idx_options_journal_status ON options_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_options_journal_created_at ON options_journal_entries(created_at DESC);

-- RLS (enable with open read/write for service role)
ALTER TABLE options_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to options journal"
    ON options_journal_entries
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_options_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER options_journal_updated_at_trigger
    BEFORE UPDATE ON options_journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_options_journal_updated_at();
