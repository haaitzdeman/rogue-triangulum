# Bolt's Journal

## 2024-05-23 - [Prevent Chart Recreation on Data Updates]
**Learning:** Recreating third-party chart instances (like `lightweight-charts`) on every data update is a massive performance bottleneck.
**Action:** Always decouple chart initialization (mount/config) from data updates. Use `useRef` to store chart/series instances and update them imperatively via their API (e.g., `.setData()`) in a separate `useEffect`.
