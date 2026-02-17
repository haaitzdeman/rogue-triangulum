-- Create premarket_journal_entries table for paper mode trading journal
-- Supports tracking gap trade candidates with analog stats and outcomes

CREATE TABLE IF NOT EXISTS premarket_journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Scan context
    effective_date DATE NOT NULL,
    scan_generated_at TIMESTAMPTZ NOT NULL,
    config_used JSONB NOT NULL,
    
    -- Candidate data
    symbol TEXT NOT NULL,
    gap_pct NUMERIC(8,4) NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
    play_type TEXT NOT NULL CHECK (play_type IN ('CONTINUATION', 'FADE', 'AVOID')),
    confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'LOW')),
    low_confidence BOOLEAN DEFAULT FALSE NOT NULL,
    
    -- Explanation
    because TEXT NOT NULL,
    key_levels JSONB NOT NULL,
    invalidation TEXT NOT NULL,
    risk_note TEXT NOT NULL,
    analog_stats JSONB NOT NULL,
    
    -- User tracking
    user_note TEXT,
    status TEXT DEFAULT 'OPEN' NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
    outcome JSONB
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_journal_effective_date ON premarket_journal_entries(effective_date);
CREATE INDEX IF NOT EXISTS idx_journal_symbol ON premarket_journal_entries(symbol);
CREATE INDEX IF NOT EXISTS idx_journal_status ON premarket_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_created_at ON premarket_journal_entries(created_at DESC);

-- Enable RLS (for production security)
ALTER TABLE premarket_journal_entries ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
-- In single-user app, this essentially allows all access
CREATE POLICY "Allow all access" ON premarket_journal_entries
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE premarket_journal_entries IS 'Premarket gap trade journal for paper mode tracking';
