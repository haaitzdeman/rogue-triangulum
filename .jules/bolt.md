## 2024-05-23 - TradingChart Optimization
**Learning:** Recreating `lightweight-charts` instances on every data update causes significant performance overhead and flashing.
**Action:** Separate chart initialization from data updates. Use `useRef` to store series instances. Use a **Callback Ref** (via `useState`) for the chart container to ensure initialization logic runs reliably only when the DOM element is actually available, avoiding "blank chart" issues in complex render trees.
