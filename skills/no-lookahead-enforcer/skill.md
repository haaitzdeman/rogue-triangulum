# Skill: No-Lookahead Enforcer (Walk-Forward Correctness)

## Purpose
Guarantee that any backtest, calibration, evaluation, or grading system cannot access future data relative to the decision timestamp.

## When to Use
Use when implementing:
- dataset builders
- walk-forward calibration
- signal evaluation
- any feature that grades decisions against "future" outcomes

## Inputs
- Bars array per symbol: ordered by timestamp ascending.
- Decision index N (signal bar).
- Horizon rules (e.g., D+1 open, D+3 close, bar-indexed).

## Outputs
- A no-lookahead contract (documented).
- Tests that prove the contract.
- Guard functions that enforce slice boundaries.

## Hard Rules
1) Signal generation at index N may only access bars[0..N] inclusive.
2) Entry/exit simulation may only access bars after N (e.g., N+1..).
3) Feature builders must take an explicit (bars, endIndex) and slice internally.
4) Evaluation horizons must be bar-indexed, not calendar-day.
5) Tests must include an intentional "poison pill" bar after N to prove it is not read.
6) No emojis.

## Procedure
1) Implement a helper:
   - getHistorySlice(bars, endIndex) => bars.slice(0, endIndex + 1)
2) Refactor all strategy/feature functions to accept (bars, endIndex).
3) Implement evaluation using explicit indices:
   - entryIndex = N+1
   - horizonIndex = N+k for k in {1,3,7,10}
4) Add tests:
   - Poison future bar has extreme values; ensure computed features ignore it.
   - Determinism test: same inputs => same outputs.
5) Document in SYSTEM_TRUTH.md: "No-lookahead enforced by design + tests."

## Acceptance Checks
- All feature functions take an endIndex or a pre-sliced history.
- No function reads bars beyond endIndex during signal scoring.
- Jest tests fail if future data is accessed.
