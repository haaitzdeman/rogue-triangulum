# Skill: Universe Scaling (Symbol Universe, Sample Size, Cost Control)

## Purpose
Scale the symbol universe without destroying data quality, test validity, or provider budgets.

## When to Use
Use when the user requests "more tickers", broader coverage, or production scaling.

## Inputs
- Provider limits (history depth, rate limits, cost)
- Target timeframe (daily swing vs intraday)
- Compute budget (runtime, storage)
- Minimum sample size requirements per bucket/regime

## Outputs
- A phased universe expansion plan with concrete thresholds.
- A config file format (tickers.txt and/or training.json).
- Guardrails: skip symbols with low completeness or insufficient bars.

## Hard Rules
1) Start with a smaller universe ONLY to validate system correctness, not as a final limit.
2) Scale in phases; each phase must pass:
   - completeness >= 98%
   - minimum signals per bucket >= 200 (or configured)
3) Reject symbols with persistent gaps unless explicitly allowed.
4) Keep results comparable: use consistent date ranges across symbols per phase.
5) No emojis.

## Procedure
1) Phase 0 (Correctness): 10–20 symbols; run end-to-end proofs.
2) Phase 1 (Stability): 50 symbols; validate manifest completeness and calibration benchmark.
3) Phase 2 (Coverage): 150–300 symbols; add sector balance and liquidity filters.
4) Phase 3 (Broad): 500–2000 symbols; require:
   - incremental dataset builds
   - caching
   - resumable jobs
5) Add configuration:
   - data/config/training.json: { symbolCount, universeFile, startDate, endDate }
   - data/config/tickers.txt: one symbol per line
6) Add reporting:
   - manifest.json must show per-symbol barCount and completeness.

## Acceptance Checks
- Universe size is configurable without code changes.
- Symbols with low completeness are flagged or excluded.
- Sample-size guardrails prevent overfitting to tiny buckets.
