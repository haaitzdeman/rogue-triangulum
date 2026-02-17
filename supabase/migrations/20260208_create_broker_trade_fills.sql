-- Create broker_trade_fills table for synced trade fills from brokers
-- Supports dedup via unique broker_trade_id

CREATE TABLE IF NOT EXISTS broker_trade_fills (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    broker TEXT NOT NULL,
    broker_trade_id TEXT NOT NULL UNIQUE,
    payload JSONB,
    normalized JSONB NOT NULL,
    filled_at TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_broker_fills_filled_at ON broker_trade_fills(filled_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_fills_symbol ON broker_trade_fills(symbol);
CREATE INDEX IF NOT EXISTS idx_broker_fills_broker ON broker_trade_fills(broker);

-- Enable RLS
ALTER TABLE broker_trade_fills ENABLE ROW LEVEL SECURITY;

-- Allow all access for authenticated users (single-user app)
CREATE POLICY "Allow all access" ON broker_trade_fills
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE broker_trade_fills IS 'Synced trade fills from broker integrations (read-only sync)';
