## 2026-02-04 - Lightweight Charts Optimization
**Learning:** `lightweight-charts` instances are expensive to create. The `TradingChart` component was recreating the chart on every data update because `candles` was in the initialization effect dependencies.
**Action:** Always separate Chart Initialization (creation, series addition) from Data Updates (setData/update) into distinct `useEffect` hooks. Use `useRef` to hold chart and series instances. Ensure `fitContent` is called intelligently (only on symbol/context change), not on every data tick.
