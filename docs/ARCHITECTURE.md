# Rogue Triangulum — Architecture

## Desk Model

The app is organized into independent "desk brains" — each desk owns its own
scanner, decision layer, types, caching, and journal integration.

```
src/lib/brains/
├── premarket/    ← re-exports from src/lib/premarket/*
├── options/      ← re-exports from src/lib/options/*
├── coordinator/  ← cross-desk ranking (opportunity engine)
├── swing/        ← placeholder (NOT_IMPLEMENTED)
└── daytrading/   ← placeholder (NOT_IMPLEMENTED)
```

> **Compatibility rule**: existing `src/lib/premarket/*` and `src/lib/options/*`
> paths remain valid. The `brains/` layer is a forward-facing API for new code.

## Routes (must not change)

| Route | Method | Purpose |
|-------|--------|---------|
| `/premarket` | GET (page) | Gap scanner UI |
| `/options` | GET (page) | Options scanner UI |
| `/today` | GET (page) | Unified opportunity dashboard |
| `/api/premarket/gaps` | GET | Run/load gap scan |
| `/api/premarket/history` | GET | List cached scan dates |
| `/api/premarket/journal` | GET/POST | Journal entries |
| `/api/premarket/journal/[id]` | PATCH/DELETE | Update/delete journal entry |
| `/api/options/scan` | GET | Run options scan |
| `/api/options/history` | GET | List cached options scans |
| `/api/options/journal` | GET/POST | Options journal entries |
| `/api/today/opportunities` | GET | Cross-desk ranked opportunities |
| `/api/dev/premarket-diagnostics` | GET | Provider diagnostics (dev) |
| `/api/dev/premarket-live-diagnostics` | GET | Live provider diagnostics (dev) |

## Data Cache Locations

| Desk | Path | Format |
|------|------|--------|
| Premarket | `data/premarket/{YYYY-MM-DD}.json` | `PremarketScanResult` |
| Options | `data/options/{YYYY-MM-DD}/{SYMBOL}.json` | `OptionScanCandidate` |
| Datasets | `data/datasets/{SYMBOL}.json` | Historical bars |
| Universe | `data/universe/tickers.txt` | One symbol per line |

## Journal Tables (Supabase)

| Table | Desk |
|-------|------|
| `premarket_journal_entries` | Premarket |
| `options_journal_entries` | Options |

## /today Dependencies

The `/api/today/opportunities` route reads from:
1. `data/premarket/{today}.json` → `PremarketScanResult.candidates`
2. `data/options/{today}/*.json` → `OptionScanCandidate[]`
3. `src/lib/integration/opportunity-engine.ts` → scoring + alignment

## Boundary Rules

- Options decision layer must NOT import premarket decision layer
- Premarket decision layer must NOT import options decision layer
- Coordinator reads cached outputs only — no decision-layer imports
- Each desk brain owns its own types file
