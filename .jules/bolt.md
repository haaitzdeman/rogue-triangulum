## 2024-05-24 - Lightweight Charts Performance
**Learning:** `TradingChart.tsx` was destroying and recreating the chart instance on every data update (candle change). This is extremely expensive for high-frequency data.
**Action:** Always separate chart initialization (DOM element creation, series addition) from data updates (`setData` or `update`). Use `useRef` to store chart and series instances to allow efficient updates.
