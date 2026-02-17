# Skill: Execution Safety Contract (Paper/Live + MHC)

## Purpose
Guarantee safe trade execution: default paper mode, live mode locked, and Manual Human Check (MHC) enforced server-side.

## When to Use
Use when implementing any execution endpoint, broker adapter, or UI action that can create an order.

## Inputs
- TradeIntent (symbol, side, qty, strategyName, score, confidence)
- Requested mode (paper/live)
- mhcApproved boolean

## Outputs
- ExecutionResult with a consistent response shape
- Guardrail rejection reasons and codes

## Hard Rules
1) Default mode is paper.
2) Client cannot force live mode by sending mode=live.
3) If requestedMode=live and effective mode is not live, reject with 403 and errorCode=live_locked.
4) MHC must be enforced server-side before execution; low score/confidence, restricted symbols, and value thresholds must trigger MHC.
5) Broker isolation:
   - only TradeGate imports broker implementations.
6) No emojis.

## Procedure
1) API route parses requestedMode but uses server effectiveMode.
2) If live requested while locked:
   - return 403 live_locked
   - do not call execute
3) TradeGate.execute also belt+suspenders checks requestedMode vs effectiveMode.
4) MHC evaluation:
   - if MHC required and mhcApproved=false => reject mhc_rejected
5) Paper execution:
   - uses real quote + slippage
   - persists to JSON store server-side

## Acceptance Checks
- live request while locked does not write executions.
- mhcApproved=false rejects when MHC required.
- mhcApproved=true allows paper fill when otherwise eligible.
- Grep shows broker imports only in allowed files.
