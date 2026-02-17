-- Morning Run Runs table
-- Replaces filesystem persistence under data/morning-run/{date}/{runId}.json
-- payload JSONB stores the full MorningRunResponse for reproducibility

CREATE TABLE IF NOT EXISTS morning_run_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          text NOT NULL UNIQUE,
    run_date        date NOT NULL,
    generated_at    timestamptz NOT NULL,
    prefer_live     boolean NOT NULL DEFAULT false,
    force           boolean NOT NULL DEFAULT false,
    max_symbols     int NOT NULL DEFAULT 12,
    auto_journal    boolean NOT NULL DEFAULT false,
    auto_journal_threshold int NULL,
    risk_blocked    boolean NOT NULL DEFAULT false,
    risk_reason     text NULL,
    payload         jsonb NOT NULL
);

-- Fast lookup: history queries filter by date, order by generated_at desc
CREATE INDEX IF NOT EXISTS idx_morning_run_runs_date_generated
    ON morning_run_runs (run_date, generated_at DESC);

-- Enable RLS (admin/service-role only)
ALTER TABLE morning_run_runs ENABLE ROW LEVEL SECURITY;
