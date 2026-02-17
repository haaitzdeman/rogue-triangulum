# Skill: Signal Journal Contract (Record, Evaluate, Report)

## Purpose
Persist every signal and evaluate outcomes against real market data with honest metrics.

## When to Use
Use when implementing:
- signal recording
- outcome evaluation
- performance dashboards
- exports

## Inputs
- Candidate signals (symbol, direction, score, reasons, timestamps, stops/targets)
- Market bars from provider (post-signal)

## Outputs
- Signal store updates (idempotent)
- Outcome records (MFE/MAE, horizon returns, exit simulation)
- Aggregated stats (by strategy/regime/score bucket)

## Hard Rules
1) Recording must be non-blocking to scanning; failures do not break scans.
2) Deterministic IDs and idempotent writes.
3) Evaluation uses bar-indexed horizons (trading bars), not calendar days.
4) If outcomes cannot be computed due to missing bars, mark as skipped with reason.
5) No "predicted" performance fields unless they are actually computed.
6) No emojis.

## Procedure
1) Record: POST /api/journal/record
2) Evaluate: POST /api/journal/evaluate
3) For each signal:
   - entryIndex = signalIndex + 1
   - compute returns at k bars
   - simulate target/stop/time
   - compute mfe/mae
4) Stats:
   - only include evaluated signals
   - apply minimum sample thresholds for bucket stats

## Acceptance Checks
- New signals appear in the store after scans.
- Evaluation produces outcomes only when enough bars exist.
- Stats match outcomes deterministically.
