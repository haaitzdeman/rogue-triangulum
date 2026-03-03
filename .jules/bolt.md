## 2024-05-23 - Lightweight Charts & React Refs
**Learning:** `lightweight-charts` requires careful handling in React to avoid chart destruction on data updates. Using `useRef` to store series instances and separating chart initialization from data updates is critical.
**Action:** Always decouple `createChart` (Init Effect) from `series.setData` (Data Effect). Use `useCallback` for data update logic to satisfy linter and ensure stability.
