## 2024-05-22 - TradingChart Performance Pattern
**Learning:** `TradingChart` was being unmounted and recreated on every data fetch because the parent component (`DayTradingPage`) conditionally rendered a loading state. This defeated the internal optimization of reusing the chart instance.
**Action:** Always keep visualization components mounted. Use CSS overlays for loading states instead of conditional rendering.
