## Goal
Assign regime tags to a symbol at a given time.

## Steps
1. Fetch ADX and ATR values for the recent period.
2. Evaluate regime thresholds:
   - trending if ADX > threshold
   - highVol if ATR% > threshold
3. Return:
   {regimeTrending: boolean, regimeHighVol: boolean}

## Constraints
- MUST use only past & current bars.
- MUST document thresholds and sources.
