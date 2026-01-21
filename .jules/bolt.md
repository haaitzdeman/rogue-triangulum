## 2024-05-23 - Indicator Calculation Efficiency
**Learning:** Financial indicators in `technical.ts` were implemented using O(N^2) logic by re-calculating EMAs on growing slices of data.
**Action:** Always verify computational complexity of indicator functions. Use streaming/incremental calculations or vector operations where possible.
