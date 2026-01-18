# SYSTEM_TRUTH.md
# Trading System Architecture & Capabilities

**Last Updated:** 2026-01-18
**Version:** V1 (Phase A - Daily Only)

---

## What This System ACTUALLY Does

### ✅ Strategy Scanner
- Runs 4 rule-based strategies against historical daily data
- Produces ranked candidates with clear reasons
- NO AI, NO ML, NO "learning" - just indicator-based rules

### ✅ Backtester V1
- Backtests strategies against historical daily bars
- Strict anti-lookahead enforcement
- Entry at D+1 open, exit at stop/target/time

### ⚠️ Paper Trading (NOT IMPLEMENTED)
- Order execution is **placeholder only**
- Fill prices are **NOT** from real market quotes
- This feature requires real-time quote fetching which is not built

---

## Prediction Targets (Per Desk)

| Desk | Target | Horizon | Status |
|------|--------|---------|--------|
| Day Trading | Direction (long/short) | Not in V1 | ❌ Phase B |
| Swing | Direction + Target Price | 3-10 days | ✅ V1 |
| Options | Not implemented | - | ❌ Future |
| Investing | Not implemented | - | ❌ Future |

**V1 implements SWING only (daily bars, 3-10 day holds)**

---

## Data Sources

| Source | Data Type | Usage |
|--------|-----------|-------|
| Polygon.io | Daily OHLCV | Historical backtest |
| Polygon.io | Real-time quotes | Paper trading fills |

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
- `confidence`: 0-1
- `reasons[]`: Human-readable explanations
- `invalidation`: Price level that kills the trade

---

## Anti-Lookahead Rules (ENFORCED)

1. At bar[i], only bars[0..i] are visible
2. Signal computed on day D uses close[D]
3. Entry is at open[D+1] (cannot use D close for entry)
4. Stops/targets evaluated on days D+1 onward only

---

## What Updates Over Time (HONEST ANSWER)

### ❌ NOTHING LEARNS AUTOMATICALLY
- No expert weight adjustments
- No pattern recognition
- No model training

### ✅ User Can Adjust
- Strategy parameters (via code)
- Backtest date ranges
- Position sizing
- Slippage assumptions

---

## What Is NOT Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Machine Learning | ❌ | No models, no training |
| Reinforcement Learning | ❌ | Removed (fake) |
| Expert Weighting | ❌ | Removed (fake) |
| Live Trading | ❌ | Not safe yet |
| Intraday Backtesting | ❌ | Phase B |
| Options Analysis | ❌ | Future |
| Multi-Symbol Universe | ⚠️ | Single symbol only |
| Real Brokerage Integration | ❌ | Paper only |

---

## Metrics Computed

### Core
- Win Rate
- Total Return (%)
- Profit Factor
- Max Drawdown

### R-Multiple
- Average R per trade
- Average Win R
- Average Loss R
- Expectancy in R

### Breakdowns
- By Strategy
- By Year
- By Regime (simplified: trending vs choppy)

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
# 6. Click a trade to see entry/exit/reasons
```

---

## File Map

```
src/lib/
├── strategies/          # Strategy definitions
│   ├── types.ts         # StrategySignal, IndicatorSnapshot
│   ├── momentum.ts      # Momentum strategy
│   ├── breakout.ts      # Breakout strategy
│   ├── meanReversion.ts # Mean reversion strategy
│   └── trendFollow.ts   # Trend following strategy
├── backtest/            # Backtesting engine
│   └── strategy-backtester.ts  # V1 daily backtester
├── indicators/          # Technical indicators (real math)
│   ├── technical.ts     # RSI, MACD, BB, etc.
│   └── extended.ts      # ADX, Stochastic, etc.
└── training/            # Data providers only
    └── polygon-provider.ts  # Polygon API integration
```

---

## Removed (Fake Learning)

The following files were deleted as they did not produce real learning:
- `meticulous-engine.ts` (2041 lines)
- `reinforcement-engine.ts`
- `smart-simulator.ts`
- `daily-simulator.ts`
- `options-consensus.ts`
- `regime-detector.ts`
- `defensive-strategies.ts`
- `replay-runner.ts`
- `setup-scorer.ts`

**Total: ~5000 lines of fake complexity removed**

---

## Honest Disclaimer

This is a **backtesting and scanning tool**, not a money-making system.

- Past performance ≠ future results
- Backtests are always optimistic
- Real trading has costs, slippage, and emotional factors
- Use for education and strategy development only
