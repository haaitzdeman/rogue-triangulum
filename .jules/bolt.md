# BOLT'S JOURNAL - CRITICAL LEARNINGS ONLY

## 2025-01-26 - Optimized MACD Calculation
**Learning:** Nested loops recalculating technical indicators (like EMA) on growing slices caused O(N²) complexity, leading to severe performance degradation on large datasets.
**Action:** Always verify if an indicator calculation can be incremental or vectorized (O(N)) before implementing naive slice-based approaches.
