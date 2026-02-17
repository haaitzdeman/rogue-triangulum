# SYSTEM_TRUTH.md
# Trading System Architecture & Capabilities

**Last Updated:** 2026-01-19
**Version:** V1 (Phase A - Daily Swing Only)

---

## ⚠️ V1 SCOPE LOCK

**This version implements SWING TRADING ONLY.**

| Feature | V1 Status |
|---------|-----------|
| Swing Trading (3-10 days) | ✅ Active |
| Day Trading | ❌ Not wired (Phase B) |
| Options | ❌ Future |
| Investing | ❌ Future |
| Paper Trading | ✅ V1.1 IMPLEMENTED |
| Live Trading | 🔒 V1.1 LOCKED (requires unlock) |

---

## What This System ACTUALLY Does

### ✅ Strategy Scanner (Swing Only)
- Runs 4 rule-based strategies against historical daily data
- Produces ranked candidates with clear reasons
- **NO AI, NO ML, NO "learning"** - just indicator-based rules
- DayTradingBrain is NOT wired in V1

### ✅ Backtester V1
- Backtests strategies against historical daily bars
- Strict anti-lookahead enforcement (unit tested)
- Entry at D+1 open, exit at stop/target/time
- Real regime tagging per trade (ADX/ATR-based)

### ✅ Paper Trading (V1.1 IMPLEMENTED)
- Order execution via TradeGate
- Fill prices from real Polygon quotes with slippage model
- Persisted to `data/paper-executions.json`
- MHC (Manual Human Check) rules enforced

---

## Prediction Outputs (V1 - EXPLAINABLE ONLY)

### ❌ REMOVED (Fake Predictions)
- `predictedReturnMean` → **null** (was fake)
- `predictedIntervalLow/High` → **null** (was fake)
- `predictedProbProfit` → **null** (was fake)

### ✅ EXPLAINABLE OUTPUTS (V1)
| Output | Description | Source |
|--------|-------------|--------|
| `riskStop` | Stop loss price | ATR × 1.5 below/above entry |
| `targetPrice` | Target price | R-multiple × risk distance |
| `targetR` | R-multiple target | Default 2R |
| `atrDollars` | ATR in dollars | 14-day ATR |
| `atrPercent` | ATR as % | ATR / price × 100 |
| `expectedMoveATR` | Expected move in ATR units | 1.5 ATR |

**UI should display: Stop, Target, ATR - NOT probability predictions.**

---

## Data Sources

| Source | Data Type | Usage |
|--------|-----------|-------|
| Polygon.io | Daily OHLCV | Historical backtest + scanner |
| Massive Stocks Starter | Daily OHLCV | Calibration dataset (5yr history) |

### Polygon.io (Legacy - Signal Evaluation)

**Rate Limit:** 5 calls/minute (Starter tier)
**History:** 2 years

### Massive Stocks Starter (Calibration Datasets)

> ⚠️ **PLAN-LIMITED DATA**: If Massive subscription is Starter tier, history may be less than 5 years. System will gracefully degrade and log "plan-limited".

| Feature | Stocks Starter | Notes |
|---------|----------------|-------|
| **History Depth** | Up to 5 years | Subject to plan tier |
| **Rate Limit** | Unlimited | No throttling required |
| **Data Delay** | 15 minutes | End-of-day for calibration is fine |
| **Endpoints** | Aggregates, Snapshots | v2/aggs/ticker |
| **Adjusted** | Yes | Split/dividend adjusted |

**CRITICAL UNKNOWNS:**
- If plan tier < Starter, history depth may be less
- Code logs `[plan-limited]` if data returned is less than requested
- Calibration still runs with available data

**Graceful Degradation:**
1. Request 5 years → receive whatever plan allows
2. Log warning if `barCount < expectedBars`
3. Calibration proceeds with available data
4. Profile marked with `dataLimited: true` if degraded

---

## Walk-Forward Calibration System (V1.1)

**TERMINOLOGY:** "Calibration", "Performance Tracking", "Walk-Forward Backtest"
**NOT:** "Training", "Learning", "AI", "ML", "Model"

### What It Actually Does

This is **performance-based weight adjustment**, NOT machine learning:
1. Split 5yr data into rolling 2yr train / 6mo test windows
2. Measure win rate and returns for each strategy × regime
3. Assign multiplier weights based on measured performance
4. Apply weights to runtime ranking

### Universe Scaling Plan

| Phase | Universe Size | Purpose |
|-------|---------------|---------|
| **A** (Current) | 20 | Stability, initial calibration |
| B | 50-100 | Diversity, sector coverage |
| C | 300+ | Scale, full market coverage |

**Universe Configuration:**
- Env: `TRAIN_UNIVERSE=AAPL,MSFT,...`
- File: `/data/config/training.json`
- Default: 20 liquid tickers (AAPL, MSFT, NVDA, etc.)

### Calibration Profile Safety

| Condition | Behavior |
|-----------|----------|
| Profile missing | All multipliers = 1.0 |
| Schema version mismatch | Fallback to defaults |
| Profile > 30 days old | UI shows "Stale" warning |
| Sample size < 200 per bucket | Factor = 1.0 (no adjustment) |
| Calibrated worse than baseline | Weights NOT applied |

### Benchmark Comparison (V1.1)

Every calibration run compares:
- **Base ranking**: Raw strategy scores
- **Calibrated ranking**: Weighted scores

Output includes:
```json
{
  "benchmark": {
    "winRate_base": 0.51,
    "winRate_calibrated": 0.53,
    "avgReturn_base": 0.82,
    "avgReturn_calibrated": 1.12,
    "sampleSize": 4872,
    "calibrationApplied": true
  }
}
```

**RULE:** If `winRate_calibrated < winRate_base`, calibration is NOT applied.

### Win Rate Definitions (Strict)

| Term | Definition | Source |
|------|------------|--------|
| **Base Win Rate** | Win rate using raw strategy scores only, no calibration weights applied | Calibration benchmark |
| **Calibrated Win Rate** | Win rate after applying `strategyWeight × calibrationFactor` to each signal | Calibration benchmark |
| **Expected Win Rate** | Historical win rate for a score bucket from the calibration profile | `profile.calibrationCurve[].winRate` |
| **Realized Win Rate** | Actual win rate observed in Signal Journal for signals in that bucket | Journal evaluation |
| **Drift** | `realizedWinRate - expectedWinRate` (positive = outperforming, negative = underperforming) | Calculated client-side |

### Drift Calculation Rules

1. **Minimum Sample Size:** Drift is ONLY calculated when `sampleSize >= 200`
2. **Insufficient Data:** When sample size is below threshold:
   - Drift = `null`
   - UI shows: "Insufficient sample (<200)"
   - No percentages displayed for that bucket
3. **Drift Interpretation:**
   - `|drift| < 5%`: Normal variance (gray)
   - `drift > +5%`: Outperforming expectation (green)
   - `drift < -5%`: Underperforming expectation (red)

### API Response Schema (`/api/calibration/status`)

```typescript
interface CalibrationStatusResponse {
    status: 'ON' | 'OFF' | 'STALE';
    reason: string;
    profile: {
        createdAt: string;
        dataRange: { symbolCount: number; totalSignals: number };
        benchmark: {
            winRate_base: number;
            winRate_calibrated: number;
            sampleSize: number;
            calibrationApplied: boolean;
        } | null;
    } | null;
    scoreBuckets: {
        bucket: string;              // e.g. "70-79"
        expectedWinRate: number;     // From calibration profile
        calibrationSampleSize: number;
        drift: number | null;        // null when insufficient samples
        insufficientDataNote?: string;
    }[];
    thresholds: {
        minSampleSizePerBucket: number;  // 200
        maxProfileAgeDays: number;       // 30
    };
}
```

### UI Indicators

- **Calibration: ON** - Profile loaded, weights applied
- **Calibration: OFF** - No profile or validation failed
- **Calibration: STALE** - Profile older than 30 days

---

## Strategies (Rule-Based)

1. **Momentum** - RSI/MACD alignment
2. **Breakout** - Bollinger Band + volume confirmation
3. **Mean Reversion** - Oversold/overbought at extremes
4. **Trend Follow** - SMA crossovers + ADX confirmation

Each strategy outputs:
- `direction`: long | short | none
- `score`: 0-100
- `confidence`: 0-1 (used for filtering, not display)
- `reasons[]`: Human-readable explanations
- `invalidation`: Stop price

---

## Anti-Lookahead Rules (ENFORCED + TESTED)

1. At bar[i], only bars[0..i] are visible
2. Signal computed on day D uses close[D]
3. Entry is at open[D+1] (cannot use D close for entry)
4. Stops/targets evaluated on days D+1 onward only

**Unit test:** `src/lib/backtest/__tests__/anti-lookahead.test.ts`

---

## Regime Breakdown (V1 - REAL)

Regime is tagged **per trade at signal time**:

| Regime | Condition | 
|--------|-----------|
| Trending | ADX > 25 at signal |
| Choppy | ADX ≤ 25 at signal |
| High Vol | ATR% > 2% at signal |
| Low Vol | ATR% ≤ 2% at signal |

Stats are computed from these real tags, not fake array slicing.

---

## What Is NOT Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Machine Learning | ❌ | No models, no training |
| Prediction Probabilities | ❌ | Removed (fake) |
| Day Trading | ❌ | Not wired (Phase B) |
| Intraday Backtesting | ❌ | Phase B |
| Options Analysis | ❌ | Future |

---

## Execution Layer (V1.1)

### Trading Modes

| Mode | Description | Status |
|------|-------------|--------|
| **PAPER** | Simulated fills using real quotes + slippage | ✅ Default |
| **LIVE** | Real broker orders | 🔒 Locked by default |

### Live Mode Safety

1. **Locked by default** - cannot select Live without unlock
2. **Unlock requires typing "ENABLE LIVE" exactly**
3. **Unlock expires after 15 minutes**
4. **All live trades require MHC approval**

### MHC (Manual Human Check) Rules

Trades require manual approval if:

| Rule | Threshold | Triggered When |
|------|-----------|----------------|
| Low confidence | < 0.70 | Score-based filtering |
| Low score | < 75 | Weak signals |
| Unapproved symbol | Not in watchlist | Unknown tickers |
| Options trade | Any | Not supported V1 |
| Large position | > $1000 | Size risk |
| **Live mode** | Always | All live trades |

### Execution Authority

**HARD RULE: Only `TradeGate` can execute trades.**

- Brains/Orchestrator propose `TradeIntent`
- TradeGate routes to PaperBroker or LiveAdapter
- No other module imports broker adapters

### Execution Files

```
src/lib/execution/
├── execution-types.ts      # TradeIntent, ExecutionResult types
├── trade-gate.ts           # Single execution authority
├── paper-broker.ts         # Simulated execution
├── paper-store.ts          # JSON persistence
├── broker-adapter.ts       # Broker interface
└── brokers/
    └── live-broker-stub.ts # Placeholder for real broker

src/lib/risk/
└── mhc.ts                  # Manual Human Check rules

src/contexts/
└── TradingModeContext.tsx  # App-wide mode state

src/components/execution/
├── TradingModeToggle.tsx
├── LiveUnlockModal.tsx
├── MHCApprovalModal.tsx
└── ExecuteButton.tsx
```

---

## Signal Journal (V1 - Performance Tracking)

**Terminology:** We use "tracking", "evaluation", "performance", "calibration" - NOT "learning" or "AI".

### What It Does
- Records every scanner signal with strategy, score, direction, regime tags
- Evaluates outcomes post-hoc against real daily bars
- Computes MFE/MAE, hit target/stop rates, returns at 1/3/7/10 bar horizons
- Aggregates stats by strategy, regime, score bucket

### ⚠️ STORAGE WARNING

**The JSON journal (`data/signal-journal.json`) is for DEV/SELF-HOST ONLY.**

- All writes happen server-side via API routes
- No durability guarantees - file may be lost on redeploy
- For production: migrate to SQLite or Supabase
- Vercel/serverless = NO persistent filesystem

### Bar-Indexed Alignment

Evaluation uses bar indexing for anti-lookahead:
1. Signal computed on bar D (close)
2. Entry at bar D+1 open
3. Horizons: D+1, D+3, D+7, D+10 (trading bars, not calendar)
4. Weekends/holidays automatically skipped

### UI Access

- **Signal Journal:** `/signal-journal`
- **Manual Journal:** `/journal` (separate, for trade logging)

---

## File Map (V1)

```
src/lib/
├── strategies/           # Strategy definitions
├── backtest/             # Backtesting engine
│   ├── strategy-backtester.ts
│   └── __tests__/anti-lookahead.test.ts
├── indicators/           # Technical indicators
├── data/                 # Data providers
│   └── market-data-provider.ts  # Unified interface
├── brains/specialists/
│   └── swing-brain.ts    # V1 - Active
│   └── day-trading-brain.ts  # V1 - NOT WIRED
├── journal/              # Signal Journal (V1)
│   ├── signal-types.ts   # SignalRecord, SignalOutcome types
│   ├── signal-store.ts   # JSON file store (server-side)
│   ├── signal-recorder.ts # Records signals from Orchestrator
│   └── signal-evaluator.ts # Evaluates outcomes vs real data
└── core/
    └── orchestrator.ts   # Routes to SwingBrain + records signals

src/app/api/journal/      # Signal Journal API routes
├── route.ts              # GET signals/stats
├── record/route.ts       # POST record signals
└── evaluate/route.ts     # POST trigger evaluation

data/
└── signal-journal.json   # Persisted signals (DEV/SELF-HOST ONLY)
```

---

## Demo Path

```bash
# 1. Start app
npm run dev

# 2. Go to backtester
open http://localhost:3000/learning

# 3. Select symbol (AAPL) and year (2024)
# 4. Click "Run Backtest"
# 5. View results: metrics, equity curve, trade list
# 6. Click a trade to see entry/exit/reasons (ATR-based)
```

---

## Honest Disclaimer

This is a **backtesting and scanning tool**, not a money-making system.

- Past performance ≠ future results
- Backtests are always optimistic
- Real trading has costs, slippage, and emotional factors
- Use for education and strategy development only
- **NO prediction probabilities are real - they are removed**

