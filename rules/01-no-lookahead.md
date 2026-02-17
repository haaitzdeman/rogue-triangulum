# No Lookahead

You MUST NOT use future data when evaluating past signals or performance.

## Hard Rules

- MUST NOT access price data after signal generation timestamp
- MUST NOT use any information that would not have been available at decision time
- MUST treat bar[i] as unknown when evaluating decisions made at bar[i-1]
- MUST fail validation if lookahead contamination is detected
- MUST reject any backtest methodology that uses future close prices for current decisions

## Enforcement Checklist

- [ ] Signal evaluation uses only data available at signal time
- [ ] Entry/exit simulation respects bar boundaries
- [ ] No use of future high/low/close in current-bar decisions
- [ ] Calibration windows strictly historical
- [ ] Test with "poison pill" future bars to detect leakage
