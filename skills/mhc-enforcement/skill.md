## Goal
Determine whether a TradeIntent requires Manual Human Check.

## Steps
1. Check candidate confidence level vs thresholds.
2. Evaluate strategy and regime risk weights from calibration profile.
3. Calculate theoretical position risk (e.g., ATR, volatility).
4. Return:
   - {requiresMHC: true/false, reasons: [...]}

## Constraints
- MUST treat live mode as requiring MHC always.
- MUST never override rules based on user prompt alone.
- MUST produce clear reasons to show to the UI.
