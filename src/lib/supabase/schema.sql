-- Rogue Triangulum Database Schema
-- Run this in Supabase SQL Editor to create tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    desk_type VARCHAR(50) DEFAULT 'swing',
    price_target DECIMAL(12,4),
    stop_loss DECIMAL(12,4),
    alert_enabled BOOLEAN DEFAULT false,
    tags TEXT[] DEFAULT '{}',
    
    UNIQUE(symbol, desk_type)
);

-- Journal entries table
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('trade', 'observation', 'lesson', 'mistake')),
    desk_type VARCHAR(50) NOT NULL,
    setup_type VARCHAR(100),
    entry_price DECIMAL(12,4),
    exit_price DECIMAL(12,4),
    position_size DECIMAL(12,4),
    pnl DECIMAL(12,2),
    pnl_percent DECIMAL(8,4),
    notes TEXT NOT NULL,
    lessons_learned TEXT,
    mistake_category VARCHAR(100),
    screenshot_urls TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}'
);

-- Expert calibration table
CREATE TABLE IF NOT EXISTS expert_calibration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expert_name VARCHAR(100) NOT NULL,
    desk_type VARCHAR(50) NOT NULL,
    weight DECIMAL(5,4) DEFAULT 0.1,
    accuracy_30d DECIMAL(5,4),
    total_signals INTEGER DEFAULT 0,
    correct_signals INTEGER DEFAULT 0,
    last_calibrated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(expert_name, desk_type)
);

-- Market data cache table
CREATE TABLE IF NOT EXISTS market_data_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlist_desk ON watchlist(desk_type);
CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_entries(symbol);
CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_type ON journal_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_cache_key ON market_data_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON market_data_cache(expires_at);

-- Trigger to update updated_at on journal entries
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_journal_entries_updated_at
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cleanup expired cache entries (run periodically via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM market_data_cache WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- Row Level Security (RLS) - enable for single-user setup
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (single-user app with anon key)
CREATE POLICY "Allow all for anon" ON watchlist FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON journal_entries FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON expert_calibration FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON market_data_cache FOR ALL USING (true);
