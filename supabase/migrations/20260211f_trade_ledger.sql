-- Trade Ledger — Immutable realized PnL records
-- Append-only: UPDATE and DELETE are blocked by trigger.
-- Journal entries remain mutable; this table is the audit-grade source of truth.

CREATE TABLE IF NOT EXISTS trade_ledger (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id            uuid NOT NULL,
    desk                text NOT NULL,           -- PREMARKET | OPTIONS
    symbol              text NOT NULL,
    trade_direction     text NOT NULL,           -- LONG | SHORT
    entry_timestamp     timestamptz NOT NULL,
    exit_timestamp      timestamptz NOT NULL,
    entry_price         numeric NOT NULL,        -- avg_entry_price if scaled
    exit_price          numeric NOT NULL,
    quantity            numeric NOT NULL,         -- total_qty
    realized_pnl        numeric NOT NULL,
    r_multiple          numeric NULL,
    reconcile_batch_id  text NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_ledger_entry_id
    ON trade_ledger (entry_id);

CREATE INDEX IF NOT EXISTS idx_trade_ledger_symbol_ts
    ON trade_ledger (symbol, entry_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trade_ledger_exit_date
    ON trade_ledger (exit_timestamp);

-- Immutability trigger: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION trade_ledger_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'trade_ledger is immutable: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_ledger_no_update
    BEFORE UPDATE ON trade_ledger
    FOR EACH ROW EXECUTE FUNCTION trade_ledger_immutable();

CREATE TRIGGER trade_ledger_no_delete
    BEFORE DELETE ON trade_ledger
    FOR EACH ROW EXECUTE FUNCTION trade_ledger_immutable();

-- Enable RLS (service-role only)
ALTER TABLE trade_ledger ENABLE ROW LEVEL SECURITY;
