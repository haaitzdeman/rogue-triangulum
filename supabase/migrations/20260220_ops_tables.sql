-- =============================================================================
-- Phase 2: Ops Tables for Cron Job Management
-- =============================================================================

-- 1) ops_job_locks — Distributed advisory locks for cron jobs
CREATE TABLE IF NOT EXISTS ops_job_locks (
    job_name   TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ,
    last_error  TEXT
);

-- Index for stale lock cleanup
CREATE INDEX IF NOT EXISTS idx_ops_job_locks_expires ON ops_job_locks (expires_at);

-- 2) ops_job_runs — Job execution history
CREATE TABLE IF NOT EXISTS ops_job_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              TEXT NOT NULL,
    job_name            TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ,
    outcome             TEXT NOT NULL CHECK (outcome IN ('ran', 'skipped_locked', 'skipped_closed', 'error')),
    fills_pulled        INT DEFAULT 0,
    trades_advanced     INT DEFAULT 0,
    ledger_rows_written INT DEFAULT 0,
    error_summary       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying latest runs per job
CREATE INDEX IF NOT EXISTS idx_ops_job_runs_job_name ON ops_job_runs (job_name, started_at DESC);

-- 3) ops_daily_checks — Daily self-check verdicts
CREATE TABLE IF NOT EXISTS ops_daily_checks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       TEXT NOT NULL,
    verdict      TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
    reasons      TEXT[] DEFAULT '{}',
    details_json JSONB DEFAULT '{}',
    checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for latest check
CREATE INDEX IF NOT EXISTS idx_ops_daily_checks_latest ON ops_daily_checks (checked_at DESC);
