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
| Paper Trading | ❌ NOT IMPLEMENTED |
| Live Trading | ❌ NOT SAFE |

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

### ❌ Paper Trading (NOT IMPLEMENTED)
- Order execution is **placeholder only**
- Fill prices are **NOT** from real market quotes
- This feature requires real-time quote fetching which is not built

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

**Rate Limit:** 5 calls/minute (Starter tier)
**History:** 2 years

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
| Paper Trading Fills | ❌ | Not implemented |
| Live Trading | ❌ | Not safe |
| Intraday Backtesting | ❌ | Phase B |
| Options Analysis | ❌ | Future |

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
└── core/
    └── orchestrator.ts   # Routes to SwingBrain only in V1
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

