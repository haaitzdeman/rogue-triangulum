## 2024-05-23 - Lightweight Charts Optimization
**Learning:** Recreating `lightweight-charts` instances on every data update (via `useEffect` dependencies) is a major performance bottleneck. It causes full DOM destruction and re-initialization.
**Action:** Always separate chart initialization (run once) from data updates (run on prop change). Use `useRef` to store chart and series instances to access them in the data update effect.
