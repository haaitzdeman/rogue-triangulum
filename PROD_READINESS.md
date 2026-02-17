# Production Readiness Checklist

> **Rogue Triangulum** — Pre-deploy validation guide.
> Last updated: 2026-02-15

---

## 1. Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `SUPABASE_URL` | Server-side DB (risk, journal, ledger) | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server privileged access (bypasses RLS) | `eyJhbG...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side Supabase access | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side anon key | `eyJhbG...` |
| `POLYGON_API_KEY` or `MASSIVE_API_KEY` | Live market data provider | `pk_abc123...` |
| `ALPACA_API_KEY` | Broker sync — API key | `AK...` |
| `ALPACA_API_SECRET` | Broker sync — API secret | `secret...` |
| `OPENAI_API_KEY` or `XAI_API_KEY` | AI agent reasoning | `sk-...` |

> **CRITICAL:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are mandatory. Without them, morning run autoJournal will fail-closed (503), risk checks will fail-closed, and ledger writes will not persist.

---

## 2. Supabase Migrations

### Application Steps

```bash
# 1. Set Supabase credentials
export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.xyz.supabase.co:5432/postgres"

# 2. Apply migrations in order
psql $SUPABASE_DB_URL -f supabase/migrations/20260131_create_premarket_journal.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260131_add_outcome_tracking.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260207_create_options_journal.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260208_create_broker_trade_fills.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260210_add_sizing_fields.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211_add_reconcile_and_autojournal_fields.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211b_add_scale_reconcile_fields.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211c_options_spread_and_reconcile.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211d_add_risk_dollars_and_draft.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211e_morning_run_runs.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260211f_trade_ledger.sql
psql $SUPABASE_DB_URL -f supabase/migrations/20260215_add_ledger_write_failed.sql
```

### Verification

```bash
# Confirm tables exist
psql $SUPABASE_DB_URL -c "\dt public.*"

# Confirm ledger_write_failed column exists
psql $SUPABASE_DB_URL -c "\d premarket_journal_entries" | grep ledger_write_failed
psql $SUPABASE_DB_URL -c "\d options_journal_entries" | grep ledger_write_failed
```

Or use the schema-health API:
```bash
curl http://localhost:3000/api/dev/schema-health | jq .status
# Expected: "PASS"
```

---

## 3. API Endpoint Smoke Tests

```bash
BASE=http://localhost:3000

# --- Health Checks ---
# Unified health (aggregates all subsystems)
curl -s $BASE/api/dev/health | jq .
# Expected: { "status": "PASS", "subsystems": { env, schema, risk } }

# Environment health
curl -s $BASE/api/dev/env-health | jq .
# Expected: { "status": "PASS", "checks": [...] }

# Schema health (verifies DB tables/columns)
curl -s $BASE/api/dev/schema-health | jq .
# Expected: { "status": "PASS", "missing": [] }

# Risk health (engine smoke test + DB reads)
curl -s $BASE/api/dev/risk-health | jq .
# Expected: { "status": "PASS", "checks": [...] }

# --- Core Workflows ---
# Morning run (no autoJournal)
curl -s -X POST $BASE/api/morning-run \
  -H "Content-Type: application/json" \
  -d '{"preferLive":false,"autoJournal":false}' | jq .success
# Expected: true

# Morning run (with autoJournal — requires DB)
curl -s -X POST $BASE/api/morning-run \
  -H "Content-Type: application/json" \
  -d '{"preferLive":false,"autoJournal":true}' | jq .
# Expected: { "success": true, "autoJournalResult": {...} }
# If DB missing: { "success": false, "errorCode": "DB_NOT_CONFIGURED" } (503)

# Morning run history
curl -s "$BASE/api/morning-run/history?date=$(date +%Y-%m-%d)" | jq .
# Expected: array of run summaries

# Daily accounting summary
curl -s "$BASE/api/accounting/daily-summary?date=$(date +%Y-%m-%d)" | jq .
# Expected: { "realizedPnl": 0, "tradeCount": 0, ... }
```

---

## 4. Log Monitoring

### Structured Tags to Watch

| Tag | Meaning | Action |
|-----|---------|--------|
| `[LEDGER_WRITE_FAILED]` | Immutable ledger write failed after EXITED status set | Check DB connectivity; query `ledger_write_failed=true` entries |
| `[MorningRun] FAIL-CLOSED` | autoJournal refused due to missing DB or risk failure | Verify `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| `[MorningRun] Risk blocked` | Daily loss limit or max positions reached | Expected during drawdown — no action needed |
| `[MorningRunStore] saveMorningRun error` | Failed to persist run to DB | Check DB quota/connectivity |
| `[TradeLedger] writeLedgerEntry error` | Ledger insert failed at DB level | Check trade_ledger table exists |
| `RISK_CHECK_FAILED_FAIL_CLOSED` | Risk engine threw during morning run | Check risk-health endpoint |

### Expected Healthy Output

```
[MorningRun] Starting run for 2026-02-15
[MorningRun] Premarket scan complete: 8 candidates
[MorningRun] Options scan: 6/8 completed
[MorningRun] Run saved: run-2026-02-15-abc123
```

---

## 5. Pre-Deploy Verification Gates

```bash
# 1. Type check
npx tsc --noEmit
# Expected: exits 0, no errors

# 2. Production build
npm run build
# Expected: exits 0, "Compiled successfully", zero warnings

# 3. Test suite
npx jest --no-cache
# Expected: all tests pass

# 4. Smoke test (after starting dev server)
npm run dev &
sleep 5
curl -s http://localhost:3000/api/dev/health | jq .status
# Expected: "PASS"
```

---

## 6. Safety Invariants

| Invariant | Enforcement | Fail Mode |
|-----------|-------------|-----------|
| Risk check before autoJournal | `morning-run/route.ts` line 344–348 | FAIL-CLOSED: blocks journal writes |
| DB required for autoJournal | `morning-run/route.ts` line 162–174 | FAIL-CLOSED: returns 503 |
| Ledger write failure visible | `journal-linker.ts` catch blocks | Marks `ledger_write_failed=true` on entry |
| Trade ledger is append-only | DB trigger on `trade_ledger` | PostgreSQL-enforced immutability |
| Reconcile engine is pure | `reconcile-engine.ts` | No DB calls — returns update instructions only |
