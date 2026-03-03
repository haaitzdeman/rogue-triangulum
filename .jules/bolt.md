## 2024-05-23 - Chart Performance Pattern
**Learning:** `lightweight-charts` instances should be preserved using `useRef` and not recreated on data updates. Recreating the chart on every render/update causes massive performance degradation and flickering.
**Action:** Separate chart initialization (creation, configuration, initial `fitContent`) from data updates (`setData`) into distinct `useEffect` hooks. Only call `fitContent` during initialization to preserve user zoom.
