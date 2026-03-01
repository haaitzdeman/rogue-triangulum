## 2025-05-23 - React Charting Re-initialization Anti-Pattern
**Learning:** `TradingChart` component was destroying and recreating the entire `lightweight-charts` instance on every data update (prop change), causing expensive DOM operations and potential flickering.
**Action:** When using stateful visualization libraries in React, always separate the **Initialization Effect** (creation/config) from the **Data Update Effect** (setData/update). Use `useRef` to store library instances.
