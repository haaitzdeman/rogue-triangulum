## Goal
Evaluate a candidate trade signal according to system rules.

## Steps
1. Validate candidate fields: symbol, entry price, horizon.
2. Fetch required historical bars from Massive provider.
3. Compute outcome metrics (return1, return3, return7, MFE, MAE).
4. Apply calibration factors from profile.
5. Return a JSON with all computed metrics and standardized reasons.

## Constraints
- MUST NOT use any future data for evaluation (no leakage).
- MUST apply safety rules (minimum sample sizes, score thresholds).
- MUST format output exactly as SignalOutcome JSON schema.
