/**
 * Strategy Backtester V1 - Daily Only
 * 
 * Runs strategies against historical daily data with strict anti-lookahead.
 * 
 * ANTI-LOOKAHEAD RULES:
 * 1. At bar[i], we only see bars[0..i] (no future data)
 * 2. Signal generated on day D uses close[D]
 * 3. Entry is at open[D+1] (next day's open)
 * 4. Exit is at close of holding period or stop/target hit
 * 
 * V1: Daily bars only, swing horizons (3-10 days)
 */

import type { Bar } from '../indicators';
import type { Strategy, IndicatorSnapshot, Direction } from '../strategies/types';
import { ALL_STRATEGIES } from '../strategies';
import {
    rsi, macd, bollingerBands, atr, adx,
    trendDirection, volumeAnalysis, findSupportResistance,
    vwapWithBands, sma, ema, stochastic
} from '../indicators';

/**
 * Single backtest trade with R-multiple tracking
 */
export interface BacktestTrade {
    id: number;
    symbol: string;
    strategy: string;
    direction: Direction;

    // Timing
    signalDate: string;        // Day signal was generated (D)
    entryDate: string;         // Day of entry (D+1)
    exitDate: string;          // Day of exit
    holdingDays: number;

    // Prices
    signalPrice: number;       // Close on signal day
    entryPrice: number;        // Open on entry day (includes slippage)
    rawEntryPrice: number;     // Open without slippage
    exitPrice: number;         // Close on exit day (or stop/target)
    stopLoss: number;          // Initial stop
    targetPrice: number;       // Target (R-multiple)

    // R-Multiple tracking
    riskAmount: number;        // Entry - Stop (absolute)
    rMultiple: number;         // P&L / Risk (how many R you made/lost)
    targetR: number;           // Target R-multiple (e.g., 2R)

    // Result
    pnlPercent: number;
    pnlDollars: number;        // Based on position size
    won: boolean;
    exitReason: 'stop' | 'target' | 'time' | 'signal';

    // Reasoning
    reasons: string[];
    score: number;
    confidence: number;

    // V1: Real regime tagging at signal time
    regime: {
        trending: boolean;   // ADX > 25 at signal
        highVol: boolean;    // ATR% > 2% at signal
    };
}

/**
 * Equity curve point
 */
export interface EquityPoint {
    date: string;
    balance: number;
    drawdown: number;
    tradeCount: number;
}

/**
 * Regime bucket performance
 */
export interface RegimeStats {
    label: string;
    trades: number;
    winRate: number;
    avgR: number;
    totalPnL: number;
}

/**
 * Backtest metrics with full V1 requirements
 */
export interface BacktestMetrics {
    // Core metrics
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;

    // P&L
    totalReturn: number;       // Total % return
    totalPnLDollars: number;
    avgWinPercent: number;
    avgLossPercent: number;

    // R-Multiple metrics
    avgR: number;              // Average R per trade (expectancy in R)
    avgWinR: number;
    avgLossR: number;
    profitFactor: number;

    // Risk metrics
    maxDrawdownPercent: number;
    maxConsecutiveLosses: number;
    avgHoldingDays: number;

    // Equity curve
    equityCurve: EquityPoint[];

    // By strategy
    byStrategy: Record<string, {
        trades: number;
        winRate: number;
        avgR: number;
        totalPnL: number;
    }>;

    // By year
    byYear: Record<number, {
        trades: number;
        winRate: number;
        totalReturn: number;
    }>;

    // By regime
    byRegime: {
        trending: RegimeStats;
        choppy: RegimeStats;
        highVol: RegimeStats;
        lowVol: RegimeStats;
    };
}

/**
 * Backtest configuration
 */
export interface BacktestConfig {
    symbol: string;
    strategies: Strategy[];

    // Position sizing
    positionSize: number;       // $ per trade (default 1000)

    // Exit rules (V1 swing defaults)
    defaultHoldingDays: number; // Default 7, configurable 3-10
    targetRMultiple: number;    // Default 2R
    useStopLoss: boolean;
    useTarget: boolean;

    // Filtering
    minScore: number;           // Min strategy score to trade (0-100)
    minConfidence: number;      // Min confidence (0-1)

    // Costs (V1: default 0, toggle exists)
    slippagePercent: number;    // % slippage per trade (default 0)
}

const DEFAULT_CONFIG: BacktestConfig = {
    symbol: 'AAPL',
    strategies: ALL_STRATEGIES,
    positionSize: 1000,
    defaultHoldingDays: 7,
    targetRMultiple: 2,
    useStopLoss: true,
    useTarget: true,
    minScore: 50,
    minConfidence: 0.5,
    slippagePercent: 0,
};

/**
 * Convert bars to indicator snapshot
 * Uses ONLY data up to current index (anti-lookahead)
 */
function computeIndicators(bars: Bar[], index: number): IndicatorSnapshot | null {
    // Only use bars up to and including current index
    const visibleBars = bars.slice(0, index + 1);

    if (visibleBars.length < 50) {
        return null; // Need 50 bars for reliable indicators
    }

    const currentBar = visibleBars[visibleBars.length - 1];

    // Compute each indicator
    const rsiVal = rsi(visibleBars, 14);
    const macdVal = macd(visibleBars);
    const bbVal = bollingerBands(visibleBars, 20, 2);
    const atrVal = atr(visibleBars, 14);
    const adxVal = adx(visibleBars, 14);
    const trend = trendDirection(visibleBars);
    const volume = volumeAnalysis(visibleBars, 20);
    const levels = findSupportResistance(visibleBars, 50);
    const vwap = vwapWithBands(visibleBars);
    const stochVal = stochastic(visibleBars, 14, 3);

    const sma20Val = sma(visibleBars, 20);
    const sma50Val = sma(visibleBars, 50);
    const ema9Val = ema(visibleBars, 9);

    return {
        price: currentBar.close,
        open: currentBar.open,
        high: currentBar.high,
        low: currentBar.low,

        sma20: sma20Val,
        sma50: sma50Val,
        ema9: ema9Val,
        trendDirection: trend.direction,

        rsi: rsiVal,
        macdLine: macdVal?.macd ?? null,
        macdSignal: macdVal?.signal ?? null,
        macdHistogram: macdVal?.histogram ?? null,
        stochK: stochVal?.k ?? null,
        stochD: stochVal?.d ?? null,

        atr: atrVal,
        bbUpper: bbVal?.upper ?? null,
        bbMiddle: bbVal?.middle ?? null,
        bbLower: bbVal?.lower ?? null,
        bbPercentB: bbVal?.percentB ?? null,

        volume: currentBar.volume,
        volumeAvg: volume?.average ?? null,
        volumeRatio: volume?.ratio ?? null,

        vwap: vwap?.vwap ?? null,
        nearestSupport: levels.nearest.support,
        nearestResistance: levels.nearest.resistance,

        adx: adxVal?.adx ?? null,
        adxTrend: adxVal?.trendDirection ?? null,
        ichimokuSignal: null,
    };
}

/**
 * Classify regime for a given bar set
 */
function classifyRegime(bars: Bar[], index: number): { trending: boolean; highVol: boolean } {
    const visibleBars = bars.slice(0, index + 1);
    if (visibleBars.length < 20) return { trending: false, highVol: false };

    const adxVal = adx(visibleBars, 14);
    const atrVal = atr(visibleBars, 14);
    const price = visibleBars[visibleBars.length - 1].close;

    const trending = (adxVal?.adx ?? 0) > 25;
    const atrPercent = atrVal ? (atrVal / price) * 100 : 0;
    const highVol = atrPercent > 2; // >2% daily ATR = high vol

    return { trending, highVol };
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Get year from timestamp
 */
function _getYear(ts: number): number {
    return new Date(ts).getFullYear();
}

/**
 * Run backtest on daily bars (V1)
 */
export function runDailyBacktest(
    bars: Bar[],
    config: Partial<BacktestConfig> = {}
): { trades: BacktestTrade[]; metrics: BacktestMetrics } {

    const cfg: BacktestConfig = { ...DEFAULT_CONFIG, ...config };

    const trades: BacktestTrade[] = [];
    const equityCurve: EquityPoint[] = [];
    let tradeId = 0;
    let inPosition = false;
    let currentTrade: Partial<BacktestTrade> | null = null;
    let entryIndex = 0;

    let balance = cfg.positionSize * 10; // Start with 10 positions worth
    let peak = balance;
    let maxDrawdown = 0;

    // Walk through bars sequentially (anti-lookahead)
    for (let i = 50; i < bars.length - 1; i++) {
        const indicators = computeIndicators(bars, i);
        if (!indicators) continue;

        const currentBar = bars[i];
        const nextBar = bars[i + 1]; // For entry price on next day

        // Track equity curve
        const drawdown = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
        equityCurve.push({
            date: formatDate(currentBar.timestamp),
            balance,
            drawdown,
            tradeCount: trades.length,
        });

        // === CHECK EXISTING POSITION ===
        if (inPosition && currentTrade) {
            const holdingDays = i - entryIndex;
            const entryPrice = currentTrade.entryPrice!;
            const direction = currentTrade.direction!;
            const stopLoss = currentTrade.stopLoss!;
            const targetPrice = currentTrade.targetPrice!;

            let exitReason: 'stop' | 'target' | 'time' | null = null;
            let exitPrice = currentBar.close;

            // Check stop loss (using daily low/high)
            if (cfg.useStopLoss && stopLoss) {
                if (direction === 'long' && currentBar.low <= stopLoss) {
                    exitReason = 'stop';
                    exitPrice = stopLoss;
                } else if (direction === 'short' && currentBar.high >= stopLoss) {
                    exitReason = 'stop';
                    exitPrice = stopLoss;
                }
            }

            // Check target
            if (!exitReason && cfg.useTarget && targetPrice) {
                if (direction === 'long' && currentBar.high >= targetPrice) {
                    exitReason = 'target';
                    exitPrice = targetPrice;
                } else if (direction === 'short' && currentBar.low <= targetPrice) {
                    exitReason = 'target';
                    exitPrice = targetPrice;
                }
            }

            // Check max holding (configurable 3-10 days)
            if (!exitReason && holdingDays >= cfg.defaultHoldingDays) {
                exitReason = 'time';
                exitPrice = currentBar.close;
            }

            // Close if exit triggered
            if (exitReason) {
                const pnlPercent = direction === 'long'
                    ? ((exitPrice - entryPrice) / entryPrice) * 100
                    : ((entryPrice - exitPrice) / entryPrice) * 100;

                const pnlDollars = (pnlPercent / 100) * cfg.positionSize;
                const riskAmount = currentTrade.riskAmount!;
                const rMultiple = riskAmount > 0 ? (pnlDollars / cfg.positionSize) / (riskAmount / entryPrice) : 0;

                const completeTrade: BacktestTrade = {
                    ...currentTrade as BacktestTrade,
                    exitDate: formatDate(currentBar.timestamp),
                    exitPrice,
                    holdingDays,
                    pnlPercent,
                    pnlDollars,
                    rMultiple,
                    won: pnlPercent > 0,
                    exitReason,
                };

                trades.push(completeTrade);
                balance += pnlDollars;
                if (balance > peak) peak = balance;
                const dd = ((peak - balance) / peak) * 100;
                if (dd > maxDrawdown) maxDrawdown = dd;

                inPosition = false;
                currentTrade = null;
            }

            continue; // Don't open new position while in one
        }

        // === LOOK FOR NEW SIGNALS ===
        for (const strategy of cfg.strategies) {
            if (!strategy.isApplicable(indicators)) continue;

            const signal = strategy.analyze(indicators);

            if (signal.direction === 'none') continue;
            if (signal.score < cfg.minScore) continue;
            if (signal.confidence < cfg.minConfidence) continue;

            // Entry at next day's open (anti-lookahead)
            const rawEntry = nextBar.open;
            const slippageAmount = (cfg.slippagePercent / 100) * rawEntry;
            const entryPrice = signal.direction === 'long'
                ? rawEntry + slippageAmount
                : rawEntry - slippageAmount;

            // Calculate stop based on ATR or strategy suggestion
            const atrVal = indicators.atr || (entryPrice * 0.02);
            const stopDistance = atrVal * 1.5;
            const stopLoss = signal.direction === 'long'
                ? entryPrice - stopDistance
                : entryPrice + stopDistance;

            // Calculate R-multiple target
            const riskAmount = Math.abs(entryPrice - stopLoss);
            const targetDistance = riskAmount * cfg.targetRMultiple;
            const targetPrice = signal.direction === 'long'
                ? entryPrice + targetDistance
                : entryPrice - targetDistance;

            // V1: Store regime at signal time for real regime stats
            const regime = classifyRegime(bars, i);

            currentTrade = {
                id: ++tradeId,
                symbol: cfg.symbol,
                strategy: strategy.name,
                direction: signal.direction,
                signalDate: formatDate(currentBar.timestamp),
                entryDate: formatDate(nextBar.timestamp),
                entryPrice,
                rawEntryPrice: rawEntry,
                signalPrice: currentBar.close,
                stopLoss,
                targetPrice,
                riskAmount,
                targetR: cfg.targetRMultiple,
                reasons: signal.reasons,
                score: signal.score,
                confidence: signal.confidence,
                regime,  // Store regime for metrics
            };

            inPosition = true;
            entryIndex = i + 1;
            break; // One trade at a time
        }
    }

    // === COMPUTE METRICS ===
    const metrics = computeMetrics(trades, cfg.strategies, equityCurve, maxDrawdown, bars);

    return { trades, metrics };
}

/**
 * Compute backtest metrics
 */
function computeMetrics(
    trades: BacktestTrade[],
    strategies: Strategy[],
    equityCurve: EquityPoint[],
    maxDrawdown: number,
    _bars: Bar[]
): BacktestMetrics {
    if (trades.length === 0) {
        return {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            totalReturn: 0,
            totalPnLDollars: 0,
            avgWinPercent: 0,
            avgLossPercent: 0,
            avgR: 0,
            avgWinR: 0,
            avgLossR: 0,
            profitFactor: 0,
            maxDrawdownPercent: 0,
            maxConsecutiveLosses: 0,
            avgHoldingDays: 0,
            equityCurve,
            byStrategy: {},
            byYear: {},
            byRegime: {
                trending: { label: 'Trending', trades: 0, winRate: 0, avgR: 0, totalPnL: 0 },
                choppy: { label: 'Choppy', trades: 0, winRate: 0, avgR: 0, totalPnL: 0 },
                highVol: { label: 'High Volatility', trades: 0, winRate: 0, avgR: 0, totalPnL: 0 },
                lowVol: { label: 'Low Volatility', trades: 0, winRate: 0, avgR: 0, totalPnL: 0 },
            },
        };
    }

    const wins = trades.filter(t => t.won);
    const losses = trades.filter(t => !t.won);

    const grossProfit = wins.reduce((s, t) => s + t.pnlDollars, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlDollars, 0));

    // Consecutive losses
    let maxConsec = 0;
    let currentConsec = 0;
    for (const trade of trades) {
        if (!trade.won) {
            currentConsec++;
            if (currentConsec > maxConsec) maxConsec = currentConsec;
        } else {
            currentConsec = 0;
        }
    }

    // By strategy
    const byStrategy: Record<string, { trades: number; winRate: number; avgR: number; totalPnL: number }> = {};
    for (const strategy of strategies) {
        const stratTrades = trades.filter(t => t.strategy === strategy.name);
        const stratWins = stratTrades.filter(t => t.won);
        byStrategy[strategy.name] = {
            trades: stratTrades.length,
            winRate: stratTrades.length > 0 ? stratWins.length / stratTrades.length : 0,
            avgR: stratTrades.length > 0 ? stratTrades.reduce((s, t) => s + t.rMultiple, 0) / stratTrades.length : 0,
            totalPnL: stratTrades.reduce((s, t) => s + t.pnlPercent, 0),
        };
    }

    // By year
    const byYear: Record<number, { trades: number; winRate: number; totalReturn: number }> = {};
    const tradesByYear = new Map<number, BacktestTrade[]>();
    for (const trade of trades) {
        const year = parseInt(trade.entryDate.slice(0, 4));
        if (!tradesByYear.has(year)) tradesByYear.set(year, []);
        tradesByYear.get(year)!.push(trade);
    }
    tradesByYear.forEach((yearTrades: BacktestTrade[], year: number) => {
        const yearWins = yearTrades.filter((t: BacktestTrade) => t.won);
        byYear[year] = {
            trades: yearTrades.length,
            winRate: yearTrades.length > 0 ? yearWins.length / yearTrades.length : 0,
            totalReturn: yearTrades.reduce((s: number, t: BacktestTrade) => s + t.pnlPercent, 0),
        };
    });

    // V1: Real regime stats from per-trade tags (not fake slicing)
    const trendingTrades = trades.filter(t => t.regime?.trending);
    const choppyTrades = trades.filter(t => !t.regime?.trending);
    const highVolTrades = trades.filter(t => t.regime?.highVol);
    const lowVolTrades = trades.filter(t => !t.regime?.highVol);

    const byRegime = {
        trending: computeRegimeStats('Trending (ADX>25)', trendingTrades),
        choppy: computeRegimeStats('Choppy (ADX≤25)', choppyTrades),
        highVol: computeRegimeStats('High Vol (ATR>2%)', highVolTrades),
        lowVol: computeRegimeStats('Low Vol (ATR≤2%)', lowVolTrades),
    };

    const avgR = trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length;
    const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + t.rMultiple, 0) / wins.length : 0;
    const avgLossR = losses.length > 0 ? losses.reduce((s, t) => s + t.rMultiple, 0) / losses.length : 0;

    return {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: wins.length / trades.length,

        totalReturn: trades.reduce((s, t) => s + t.pnlPercent, 0),
        totalPnLDollars: trades.reduce((s, t) => s + t.pnlDollars, 0),
        avgWinPercent: wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0,
        avgLossPercent: losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0,

        avgR,
        avgWinR,
        avgLossR,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,

        maxDrawdownPercent: maxDrawdown,
        maxConsecutiveLosses: maxConsec,
        avgHoldingDays: trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length,

        equityCurve,
        byStrategy,
        byYear,
        byRegime,
    };
}

function computeRegimeStats(label: string, trades: BacktestTrade[]): RegimeStats {
    if (trades.length === 0) {
        return { label, trades: 0, winRate: 0, avgR: 0, totalPnL: 0 };
    }
    const wins = trades.filter(t => t.won);
    return {
        label,
        trades: trades.length,
        winRate: wins.length / trades.length,
        avgR: trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length,
        totalPnL: trades.reduce((s, t) => s + t.pnlPercent, 0),
    };
}
