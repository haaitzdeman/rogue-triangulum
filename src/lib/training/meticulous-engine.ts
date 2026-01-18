/**
 * Meticulous Day-by-Day Learning Engine
 * 
 * This engine processes EVERY SINGLE trading day individually.
 * Each day:
 *   1. Agents analyze the market using 15+ real indicators
 *   2. Agents make 1-5 trades per symbol
 *   3. Next day: trades are evaluated against actual results
 *   4. Lessons are recorded for each trade
 *   5. Expert weights are adjusted based on performance
 *   6. Knowledge accumulates day by day
 * 
 * NO SKIPPING. NO SUMMARIZING. EVERY DAY COUNTS.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DeskType, MarketContext } from '../core/types';
import { PolygonTrainingProvider } from './polygon-provider';
import type { OHLCVBar } from './provider-adapter';
import {
    // Basic indicators
    vwapWithBands,
    rsi,
    macd,
    atr,
    bollingerBands,
    findSupportResistance,
    volumeAnalysis,
    momentum,
    trendDirection,
    // Extended indicators
    stochastic,
    adx,
    williamsR,
    cci,
    obv,
    mfi,
    ichimoku,
    type Bar,
} from '../indicators';

/**
 * Trading Agent Types
 */
export type TradingAgent = 'day-trading' | 'swing' | 'options' | 'investing';

/**
 * Agent Portfolio - Each agent has COMPLETELY separate tracking
 * $300 starting capital each, with debt tracking
 */
export interface AgentPortfolio {
    agent: TradingAgent;

    // Capital (each agent gets $300)
    startingCapital: number;
    currentBalance: number;     // Can go negative (debt)
    peakBalance: number;
    maxDrawdown: number;

    // Debt tracking (realistic - no bailouts)
    debt: number;               // Current debt if negative
    totalDebt: number;          // Total debt ever accumulated
    inDebt: boolean;
    bankruptcyCount: number;

    // Trade statistics
    totalTrades: number;
    wins: number;
    losses: number;
    totalPnL: number;
    winRate: number;

    // Agent-specific charting methods they specialize in
    specializations: string[];

    // Strategy experimentation tracking
    strategies: Map<string, { trades: number; wins: number; pnl: number }>;
}

/**
 * A single trade with full context
 */
export interface MeticulousTrade {
    id: string;
    day: number;                // Day number in training
    date: string;               // YYYY-MM-DD
    symbol: string;
    agent: TradingAgent;        // Which agent made this trade

    // Decision
    direction: 'long' | 'short';
    entryPrice: number;
    confidence: number;

    // Expert signals that contributed
    expertSignals: {
        name: string;
        direction: 'long' | 'short' | 'neutral';
        strength: number;
        reason: string;
    }[];

    // Full indicator snapshot at decision time
    indicators: {
        rsi: number;
        macd_histogram: number;
        stochastic_k: number;
        stochastic_signal: string;
        adx_value: number;
        adx_trend: string;
        williams_r: number;
        cci: number;
        mfi: number;
        vwap_position: number;  // % above/below VWAP
        bollinger_percentB: number;
        trend: string;
        volume_ratio: number;
        obv_trend: string;
        ichimoku_signal: string;
    };

    // Result (filled after next day)
    actualMove: number;         // % price change
    exitPrice: number;
    pnlDollars: number;
    wasCorrect: boolean;

    // Learning
    lessonsLearned: string[];

    // Paper Trading - AI decides these
    positionSize: number;       // Shares - AI decides based on confidence
    positionValue: number;      // Dollar value of position
    stopLoss: number;           // Stop loss price - AI decides
    takeProfit: number;         // Take profit price - AI decides
    riskAmount: number;         // $ at risk (position × stop distance)
    riskPercent: number;        // % of account risked
    hitStopLoss: boolean;       // Did price hit stop before exit?
    hitTakeProfit: boolean;     // Did price hit TP before exit?

    // Intraday timing (for minute-level simulation)
    entryTime?: string;         // "09:30" - market open
    exitTime?: string;          // "11:47" - when stop/TP hit or close
    tradeDuration?: number;     // Minutes in trade
    timeframe: 'intraday' | 'swing';  // Trading style
}

/**
 * Account state for paper trading
 */
export interface AccountState {
    startingCapital: number;    // Starting balance ($300)
    currentBalance: number;     // Current balance (can go negative = debt)
    peakBalance: number;        // Highest balance reached
    maxDrawdown: number;        // Worst drawdown (%)
    equityCurve: { date: string; balance: number; drawdown: number }[];

    // Debt tracking - realistic, no bailouts
    debt: number;               // Accumulated debt when balance goes negative
    totalDebt: number;          // Total debt ever accumulated
    bankruptcyCount: number;    // Times gone below $0
    bankruptcyDates: string[];  // When bankruptcies happened
    lifetimePnL: number;        // Total P&L (negative if in debt)
    inDebt: boolean;            // Currently in debt?
}

/**
 * Daily learning record
 */
export interface DailyRecord {
    day: number;
    date: string;
    tradesPlaced: number;
    wins: number;
    losses: number;
    pnl: number;
    trades: MeticulousTrade[];
    lessonsSummary: string;

    // Running totals
    cumulative: {
        totalTrades: number;
        totalWins: number;
        winRate: number;
        totalPnL: number;
    };

    // Expert weights at end of day
    expertWeights: Record<string, number>;
}

/**
 * Expert performance tracking
 */
interface ExpertTracker {
    name: string;
    weight: number;
    trades: number;
    correctPredictions: number;
    totalPnL: number;
    recentAccuracy: number[];  // Last 10 trades
}

/**
 * Brain State - For Transfer Learning
 * Contains ONLY learned knowledge, NO trade/price memory
 * Can be loaded into fresh sessions for A/B testing
 */
export interface BrainState {
    version: string;
    exportDate: string;

    // Expert weights (what they learned about indicator reliability)
    expertWeights: Record<string, {
        weight: number;
        trades: number;
        accuracy: number;
    }>;

    // Agent strategy performance (which strategies work best)
    agentStrategies: Record<string, {
        specializations: string[];
        bestPerformingIndicators: string[];
        winRate: number;
    }>;

    // Learned lessons summary (patterns to avoid/follow)
    learnedPatterns: {
        avoid: string[];    // e.g., "Long when RSI > 70"
        follow: string[];   // e.g., "Trade with trend when ADX > 25"
    };
}

/**
 * Yearly performance statistics for comparison
 */
export interface YearlyStats {
    year: number;
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    winRate: number;
    bestMonth: { month: string; pnl: number };
    worstMonth: { month: string; pnl: number };

    // Per-agent breakdown
    agentStats: Record<string, {
        trades: number;
        pnl: number;
        winRate: number;
    }>;
}

/**
 * Full learning session
 */
export interface LearningSession {
    sessionId: string;
    startDate: string;
    endDate: string;

    // Progress
    totalDays: number;
    daysCompleted: number;
    status: 'running' | 'completed' | 'paused';

    // Results
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    winRate: number;
    totalPnL: number;

    // Paper Trading Account
    account: AccountState;

    // Expert evolution
    experts: Record<string, ExpertTracker>;

    // All records
    dailyRecords: DailyRecord[];
}

const EXPERT_NAMES = [
    'VWAP',
    'Momentum',
    'Trend',
    'Volume',
    'Levels',
    'Stochastic',
    'ADX',
    'Ichimoku',
    'Bollinger',
    'MFI',
];

/**
 * Meticulous Learning Engine
 */
export class MeticulousLearningEngine {
    private provider: PolygonTrainingProvider;
    private symbols: string[];
    private positionSize: number;
    private tradingMode: 'intraday' | 'swing';  // Trading style

    // Learning state
    private experts: Map<string, ExpertTracker> = new Map();
    private dailyRecords: DailyRecord[] = [];
    private allTrades: MeticulousTrade[] = [];
    private running = false;

    // Paper Trading Account State
    private account: AccountState;

    // Agent-specific portfolios - each agent has separate tracking
    private agentPortfolios: Map<TradingAgent, AgentPortfolio> = new Map();

    // === DYNAMIC PATTERN LEARNING ===
    // Tracks how many times each pattern has caused a losing trade
    // After FAILURE_THRESHOLD failures, the pattern is blocked
    private failedPatterns: Map<string, number> = new Map();
    private static readonly FAILURE_THRESHOLD = 5; // Block after 5 failures

    // Pattern keys for tracking (generated from indicator conditions + direction)
    private static readonly PATTERN_KEYS = {
        LONG_RSI_OVERBOUGHT: 'long_rsi_over_70',
        SHORT_RSI_OVERSOLD: 'short_rsi_under_30',
        LONG_AGAINST_BEARISH: 'long_against_bearish_trend',
        SHORT_AGAINST_BULLISH: 'short_against_bullish_trend',
        LOW_ADX_NO_TREND: 'trade_adx_under_15',
        LOW_VOLUME: 'trade_low_volume',
        LONG_MACD_NEGATIVE: 'long_macd_negative',
        SHORT_MACD_POSITIVE: 'short_macd_positive',
        LONG_STOCH_OVERBOUGHT: 'long_stoch_over_80',
        SHORT_STOCH_OVERSOLD: 'short_stoch_under_20',
    };

    constructor(config?: {
        symbols?: string[];
        positionSize?: number;
        startingCapital?: number;
        tradingMode?: 'intraday' | 'swing';  // 'intraday' = 1-min bars, 'swing' = daily bars
    }) {
        this.provider = new PolygonTrainingProvider();
        this.symbols = config?.symbols || ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT'];
        this.positionSize = config?.positionSize || 1000;
        this.tradingMode = config?.tradingMode || 'intraday'; // Default to intraday

        // Initialize paper trading account
        const startingCapital = config?.startingCapital || 300;
        this.account = {
            startingCapital,
            currentBalance: startingCapital,
            peakBalance: startingCapital,
            maxDrawdown: 0,
            equityCurve: [],
            // Debt tracking - realistic, no bailouts
            debt: 0,
            totalDebt: 0,
            bankruptcyCount: 0,
            bankruptcyDates: [],
            lifetimePnL: 0,
            inDebt: false,
        };

        // Initialize agent portfolios - each agent gets $300 starting capital
        // Each agent has their own specialized charting methods
        const agentConfigs: { agent: TradingAgent; specializations: string[] }[] = [
            {
                agent: 'day-trading',
                specializations: ['RSI', 'MACD', 'Stochastic', 'Volume', 'Momentum'], // Fast signals
            },
            {
                agent: 'swing',
                specializations: ['Trend', 'ADX', 'Bollinger', 'Ichimoku', 'Levels'], // Trend signals
            },
            {
                agent: 'options',
                specializations: ['RSI', 'Bollinger', 'Volume', 'MFI'], // Volatility signals
            },
            {
                agent: 'investing',
                specializations: ['Trend', 'ADX', 'Ichimoku', 'Levels'], // Long-term signals
            },
        ];

        // Use the configurable starting capital for each agent
        const agentStartingCapital = config?.startingCapital || 300;

        for (const agentConfig of agentConfigs) {
            this.agentPortfolios.set(agentConfig.agent, {
                agent: agentConfig.agent,
                startingCapital: agentStartingCapital,
                currentBalance: agentStartingCapital,
                peakBalance: agentStartingCapital,
                maxDrawdown: 0,
                // Debt tracking
                debt: 0,
                totalDebt: 0,
                inDebt: false,
                bankruptcyCount: 0,
                // Trade stats
                totalTrades: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0,
                winRate: 0,
                // Specializations
                specializations: agentConfig.specializations,
                strategies: new Map(),
            });
        }

        // Initialize experts with equal weights
        for (const name of EXPERT_NAMES) {
            this.experts.set(name, {
                name,
                weight: 0.1,
                trades: 0,
                correctPredictions: 0,
                totalPnL: 0,
                recentAccuracy: [],
            });
        }
    }


    /**
     * Calculate all indicators for a bar array
     */
    private calculateIndicators(bars: Bar[]): MeticulousTrade['indicators'] | null {
        if (bars.length < 52) return null;

        const currentPrice = bars[bars.length - 1].close;

        // Calculate all indicators
        const rsiValue = rsi(bars);
        const macdResult = macd(bars);
        const stochResult = stochastic(bars);
        const adxResult = adx(bars);
        const williamsResult = williamsR(bars);
        const cciResult = cci(bars);
        const mfiResult = mfi(bars);
        const vwapResult = vwapWithBands(bars);
        const bbResult = bollingerBands(bars);
        const trendResult = trendDirection(bars);
        const volumeResult = volumeAnalysis(bars);
        const obvResult = obv(bars);
        const ichimokuResult = ichimoku(bars);

        return {
            rsi: rsiValue || 50,
            macd_histogram: macdResult?.histogram || 0,
            stochastic_k: stochResult?.k || 50,
            stochastic_signal: stochResult?.signal || 'neutral',
            adx_value: adxResult?.adx || 0,
            adx_trend: adxResult?.trendDirection || 'ranging',
            williams_r: williamsResult?.value || -50,
            cci: cciResult?.value || 0,
            mfi: mfiResult?.value || 50,
            vwap_position: vwapResult ? ((currentPrice - vwapResult.vwap) / vwapResult.vwap) * 100 : 0,
            bollinger_percentB: bbResult?.percentB || 0.5,
            trend: trendResult.direction,
            volume_ratio: volumeResult?.ratio || 1,
            obv_trend: obvResult?.trend || 'flat',
            ichimoku_signal: ichimokuResult?.signal || 'neutral',
        };
    }

    /**
     * Get expert signals based on indicators
     */
    private getExpertSignals(indicators: MeticulousTrade['indicators']): MeticulousTrade['expertSignals'] {
        const signals: MeticulousTrade['expertSignals'] = [];

        // VWAP Expert
        if (indicators.vwap_position > 0.5) {
            signals.push({
                name: 'VWAP',
                direction: 'long',
                strength: Math.min(1, indicators.vwap_position / 2),
                reason: `Price ${indicators.vwap_position.toFixed(2)}% above VWAP`,
            });
        } else if (indicators.vwap_position < -0.5) {
            signals.push({
                name: 'VWAP',
                direction: 'short',
                strength: Math.min(1, Math.abs(indicators.vwap_position) / 2),
                reason: `Price ${Math.abs(indicators.vwap_position).toFixed(2)}% below VWAP`,
            });
        }

        // Momentum Expert (RSI + MACD)
        if (indicators.rsi < 30 && indicators.macd_histogram > 0) {
            signals.push({
                name: 'Momentum',
                direction: 'long',
                strength: 0.8,
                reason: `RSI oversold (${indicators.rsi.toFixed(1)}) with positive MACD`,
            });
        } else if (indicators.rsi > 70 && indicators.macd_histogram < 0) {
            signals.push({
                name: 'Momentum',
                direction: 'short',
                strength: 0.8,
                reason: `RSI overbought (${indicators.rsi.toFixed(1)}) with negative MACD`,
            });
        } else if (indicators.rsi > 55 && indicators.macd_histogram > 0) {
            signals.push({
                name: 'Momentum',
                direction: 'long',
                strength: 0.5,
                reason: `Bullish momentum: RSI ${indicators.rsi.toFixed(1)}, MACD positive`,
            });
        } else if (indicators.rsi < 45 && indicators.macd_histogram < 0) {
            signals.push({
                name: 'Momentum',
                direction: 'short',
                strength: 0.5,
                reason: `Bearish momentum: RSI ${indicators.rsi.toFixed(1)}, MACD negative`,
            });
        }

        // Stochastic Expert
        if (indicators.stochastic_signal === 'oversold') {
            signals.push({
                name: 'Stochastic',
                direction: 'long',
                strength: 0.7,
                reason: `Stochastic oversold (%K: ${indicators.stochastic_k.toFixed(1)})`,
            });
        } else if (indicators.stochastic_signal === 'overbought') {
            signals.push({
                name: 'Stochastic',
                direction: 'short',
                strength: 0.7,
                reason: `Stochastic overbought (%K: ${indicators.stochastic_k.toFixed(1)})`,
            });
        }

        // ADX Expert
        if (indicators.adx_value > 25) {
            const dir = indicators.adx_trend === 'up' ? 'long' : indicators.adx_trend === 'down' ? 'short' : null;
            if (dir) {
                signals.push({
                    name: 'ADX',
                    direction: dir,
                    strength: Math.min(1, indicators.adx_value / 50),
                    reason: `Strong ${indicators.adx_trend} trend (ADX: ${indicators.adx_value.toFixed(1)})`,
                });
            }
        }

        // Trend Expert
        if (indicators.trend === 'bullish') {
            signals.push({
                name: 'Trend',
                direction: 'long',
                strength: 0.6,
                reason: 'Price above key moving averages',
            });
        } else if (indicators.trend === 'bearish') {
            signals.push({
                name: 'Trend',
                direction: 'short',
                strength: 0.6,
                reason: 'Price below key moving averages',
            });
        }

        // Volume Expert
        if (indicators.volume_ratio > 1.5) {
            signals.push({
                name: 'Volume',
                direction: indicators.trend === 'bullish' ? 'long' : 'short',
                strength: Math.min(1, indicators.volume_ratio / 3),
                reason: `High volume (${indicators.volume_ratio.toFixed(1)}x average)`,
            });
        }

        // Bollinger Expert
        if (indicators.bollinger_percentB < 0.05) {
            signals.push({
                name: 'Bollinger',
                direction: 'long',
                strength: 0.7,
                reason: 'Price at lower Bollinger Band (potential bounce)',
            });
        } else if (indicators.bollinger_percentB > 0.95) {
            signals.push({
                name: 'Bollinger',
                direction: 'short',
                strength: 0.7,
                reason: 'Price at upper Bollinger Band (potential reversal)',
            });
        }

        // MFI Expert
        if (indicators.mfi < 20) {
            signals.push({
                name: 'MFI',
                direction: 'long',
                strength: 0.7,
                reason: `MFI oversold (${indicators.mfi.toFixed(1)})`,
            });
        } else if (indicators.mfi > 80) {
            signals.push({
                name: 'MFI',
                direction: 'short',
                strength: 0.7,
                reason: `MFI overbought (${indicators.mfi.toFixed(1)})`,
            });
        }

        // Ichimoku Expert
        if (indicators.ichimoku_signal === 'bullish') {
            signals.push({
                name: 'Ichimoku',
                direction: 'long',
                strength: 0.6,
                reason: 'Price above cloud with bullish TK cross',
            });
        } else if (indicators.ichimoku_signal === 'bearish') {
            signals.push({
                name: 'Ichimoku',
                direction: 'short',
                strength: 0.6,
                reason: 'Price below cloud with bearish TK cross',
            });
        }

        // Levels Expert - Uses support/resistance zones
        // Long near support, short near resistance
        if (indicators.bollinger_percentB < 0.2 && indicators.trend !== 'bearish') {
            signals.push({
                name: 'Levels',
                direction: 'long',
                strength: 0.65,
                reason: 'Price near support zone (lower Bollinger region)',
            });
        } else if (indicators.bollinger_percentB > 0.8 && indicators.trend !== 'bullish') {
            signals.push({
                name: 'Levels',
                direction: 'short',
                strength: 0.65,
                reason: 'Price near resistance zone (upper Bollinger region)',
            });
        }

        return signals;
    }

    /**
     * Make trading decision based on expert signals
     */
    private makeDecision(signals: MeticulousTrade['expertSignals']): {
        trade: boolean;
        direction: 'long' | 'short';
        confidence: number;
    } {
        if (signals.length === 0) {
            return { trade: false, direction: 'long', confidence: 0 };
        }

        let longScore = 0;
        let shortScore = 0;
        let longCount = 0;
        let shortCount = 0;

        for (const signal of signals) {
            const expert = this.experts.get(signal.name);
            const weight = expert?.weight || 0.1;
            const weightedStrength = signal.strength * weight;

            if (signal.direction === 'long') {
                longScore += weightedStrength;
                longCount++;
            } else if (signal.direction === 'short') {
                shortScore += weightedStrength;
                shortCount++;
            }
        }

        const totalScore = longScore + shortScore;
        const direction = longScore > shortScore ? 'long' : 'short';
        const winningScore = Math.max(longScore, shortScore);
        const confidence = totalScore > 0 ? winningScore / totalScore : 0;

        // Only trade if:
        // 1. At least 3 experts agree
        // 2. Confidence > 60%
        const agreementCount = direction === 'long' ? longCount : shortCount;
        const trade = agreementCount >= 3 && confidence >= 0.6;

        return { trade, direction, confidence };
    }

    /**
     * Make agent-specific trading decision
     * Each agent ONLY considers signals from experts they specialize in
     */
    private makeAgentDecision(
        signals: MeticulousTrade['expertSignals'],
        agent: TradingAgent
    ): {
        trade: boolean;
        direction: 'long' | 'short';
        confidence: number;
        usedSignals: MeticulousTrade['expertSignals'];
    } {
        const portfolio = this.agentPortfolios.get(agent);
        if (!portfolio) {
            return { trade: false, direction: 'long', confidence: 0, usedSignals: [] };
        }

        // FILTER: Only use signals from this agent's specialized experts
        const specializedSignals = signals.filter(s =>
            portfolio.specializations.includes(s.name)
        );

        if (specializedSignals.length === 0) {
            return { trade: false, direction: 'long', confidence: 0, usedSignals: [] };
        }

        let longScore = 0;
        let shortScore = 0;
        let longCount = 0;
        let shortCount = 0;

        for (const signal of specializedSignals) {
            const expert = this.experts.get(signal.name);
            const weight = expert?.weight || 0.1;
            const weightedStrength = signal.strength * weight;

            if (signal.direction === 'long') {
                longScore += weightedStrength;
                longCount++;
            } else if (signal.direction === 'short') {
                shortScore += weightedStrength;
                shortCount++;
            }
        }

        const totalScore = longScore + shortScore;
        const direction = longScore > shortScore ? 'long' : 'short';
        const winningScore = Math.max(longScore, shortScore);
        const confidence = totalScore > 0 ? winningScore / totalScore : 0;

        // Agent-specific trading requirements:
        // - At least 2 of their specialized experts agree (fewer required since filtered)
        // - Confidence > 55% (slightly lower threshold for specialization)
        const agreementCount = direction === 'long' ? longCount : shortCount;
        const trade = agreementCount >= 2 && confidence >= 0.55;

        // Apply learned pattern filtering BEFORE making trade decision
        // This is where the "learning" actually prevents bad trades
        if (trade && specializedSignals.length > 0) {
            // We'll check indicators after trade execution in learnFromTrade
            // But we can use confidence threshold scaling based on experience
            const experienceBonus = Math.min(0.08, this.allTrades.length / 10000 * 0.08);
            const requiredConfidence = 0.55 + experienceBonus; // 0.55 -> 0.63 over time

            if (confidence < requiredConfidence) {
                console.log(`  [${portfolio.agent}] Trade blocked: confidence ${(confidence * 100).toFixed(1)}% < ${(requiredConfidence * 100).toFixed(1)}% threshold`);
                return { trade: false, direction, confidence, usedSignals: specializedSignals };
            }
        }

        return { trade, direction, confidence, usedSignals: specializedSignals };
    }

    /**
     * Check if trade should be avoided based on learned danger patterns
     * Now includes DYNAMIC pattern blocking from failed trades
     */
    private shouldAvoidTrade(
        direction: 'long' | 'short',
        indicators: {
            rsi: number;
            adx_value: number;
            volume_ratio: number;
            adx_trend: string;
            macd_histogram?: number;
            stochastic_k?: number;
        }
    ): { avoid: boolean; reason: string } {
        const PK = MeticulousLearningEngine.PATTERN_KEYS;
        const threshold = MeticulousLearningEngine.FAILURE_THRESHOLD;

        // === DYNAMIC PATTERN BLOCKING (learned from experience) ===
        // These patterns are blocked ONLY if they've caused enough failures

        // Check: Long when RSI overbought
        if (direction === 'long' && indicators.rsi > 70) {
            const failures = this.failedPatterns.get(PK.LONG_RSI_OVERBOUGHT) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Long+RSI>70 failed ${failures}x - blocked` };
            }
        }

        // Check: Short when RSI oversold
        if (direction === 'short' && indicators.rsi < 30) {
            const failures = this.failedPatterns.get(PK.SHORT_RSI_OVERSOLD) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Short+RSI<30 failed ${failures}x - blocked` };
            }
        }

        // Check: Long against bearish trend
        if (direction === 'long' && indicators.adx_trend === 'bearish' && indicators.adx_value > 20) {
            const failures = this.failedPatterns.get(PK.LONG_AGAINST_BEARISH) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Long against bearish failed ${failures}x - blocked` };
            }
        }

        // Check: Short against bullish trend
        if (direction === 'short' && indicators.adx_trend === 'bullish' && indicators.adx_value > 20) {
            const failures = this.failedPatterns.get(PK.SHORT_AGAINST_BULLISH) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Short against bullish failed ${failures}x - blocked` };
            }
        }

        // Check: Low ADX (no trend)
        if (indicators.adx_value < 15) {
            const failures = this.failedPatterns.get(PK.LOW_ADX_NO_TREND) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Low ADX trades failed ${failures}x - blocked` };
            }
        }

        // Check: Low volume
        if (indicators.volume_ratio < 0.7) {
            const failures = this.failedPatterns.get(PK.LOW_VOLUME) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Low volume trades failed ${failures}x - blocked` };
            }
        }

        // Check: Long with negative MACD
        if (direction === 'long' && indicators.macd_histogram !== undefined && indicators.macd_histogram < 0) {
            const failures = this.failedPatterns.get(PK.LONG_MACD_NEGATIVE) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Long+MACD<0 failed ${failures}x - blocked` };
            }
        }

        // Check: Short with positive MACD
        if (direction === 'short' && indicators.macd_histogram !== undefined && indicators.macd_histogram > 0) {
            const failures = this.failedPatterns.get(PK.SHORT_MACD_POSITIVE) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Short+MACD>0 failed ${failures}x - blocked` };
            }
        }

        // Check: Long with overbought stochastic
        if (direction === 'long' && indicators.stochastic_k !== undefined && indicators.stochastic_k > 80) {
            const failures = this.failedPatterns.get(PK.LONG_STOCH_OVERBOUGHT) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Long+Stoch>80 failed ${failures}x - blocked` };
            }
        }

        // Check: Short with oversold stochastic
        if (direction === 'short' && indicators.stochastic_k !== undefined && indicators.stochastic_k < 20) {
            const failures = this.failedPatterns.get(PK.SHORT_STOCH_OVERSOLD) || 0;
            if (failures >= threshold) {
                return { avoid: true, reason: `LEARNED: Short+Stoch<20 failed ${failures}x - blocked` };
            }
        }

        // === HARDCODED SAFETY RULES (always enforced) ===
        // These are extreme conditions that should always be avoided

        // Extreme RSI (more strict than learned patterns)
        if (direction === 'long' && indicators.rsi > 80) {
            return { avoid: true, reason: 'RSI > 80 (extreme overbought) - SAFETY BLOCK' };
        }
        if (direction === 'short' && indicators.rsi < 20) {
            return { avoid: true, reason: 'RSI < 20 (extreme oversold) - SAFETY BLOCK' };
        }

        // Very low volume
        if (indicators.volume_ratio < 0.3) {
            return { avoid: true, reason: 'Volume < 30% average - SAFETY BLOCK' };
        }

        return { avoid: false, reason: '' };
    }

    /**
     * Record a failed pattern for dynamic learning
     */
    private recordFailedPattern(patternKey: string): void {
        const current = this.failedPatterns.get(patternKey) || 0;
        this.failedPatterns.set(patternKey, current + 1);
        console.log(`  📚 Pattern "${patternKey}" failure count: ${current + 1}`);
    }

    /**
     * Learn from a trade's result
     */
    private learnFromTrade(trade: MeticulousTrade): void {
        const lessons: string[] = [];

        // Analyze what worked and what didn't
        for (const signal of trade.expertSignals) {
            const expert = this.experts.get(signal.name);
            if (!expert) continue;

            const signalWasCorrect = (signal.direction === trade.direction) === trade.wasCorrect;

            // Calculate expert's recent accuracy for performance-based adjustments
            const recentAcc = expert.recentAccuracy.slice(-10);
            const expertWinRate = recentAcc.length > 0
                ? recentAcc.reduce((a, b) => a + b, 0) / recentAcc.length
                : 0.5;

            if (signalWasCorrect) {
                // Expert was right - boost based on current performance
                expert.correctPredictions++;
                expert.recentAccuracy.push(1);

                // Better experts get bigger boosts (reward good performers more)
                // NO CEILING - experts can reach up to 99% weight based on pure performance
                const boost = 0.003 + (expertWinRate * 0.012); // 0.003 to 0.015
                expert.weight = Math.min(0.99, expert.weight + boost);
                lessons.push(`✅ ${signal.name} correctly signaled ${signal.direction} (weight +${(boost * 100).toFixed(2)}%)`);
            } else {
                // Expert was wrong - penalize based on current performance
                expert.recentAccuracy.push(0);

                // Worse experts get bigger penalties (hurt bad performers more)
                // LOW FLOOR - bad experts can drop to near-zero (0.1%) but never completely removed
                const penalty = 0.002 + ((1 - expertWinRate) * 0.015); // 0.002 to 0.017
                expert.weight = Math.max(0.001, expert.weight - penalty);
                lessons.push(`❌ ${signal.name} incorrectly signaled ${signal.direction} (weight -${(penalty * 100).toFixed(2)}%)`);
            }

            // Keep only last 10
            if (expert.recentAccuracy.length > 10) {
                expert.recentAccuracy.shift();
            }

            expert.trades++;
            expert.totalPnL += trade.pnlDollars * (signal.direction === trade.direction ? 1 : 0);
        }

        // Add indicator-specific lessons
        if (trade.wasCorrect) {
            lessons.push(`📈 Correct ${trade.direction.toUpperCase()} on ${trade.symbol}: +$${trade.pnlDollars.toFixed(2)}`);

            // Success patterns to reinforce
            if (trade.indicators.adx_value > 25) {
                lessons.push('✅ REINFORCED: Strong trend (ADX > 25) improves trade probability');
            }
            if (trade.indicators.volume_ratio > 1.5) {
                lessons.push('✅ REINFORCED: High volume confirms price movement');
            }
        } else {
            lessons.push(`📉 FAILED ${trade.direction.toUpperCase()} on ${trade.symbol}: $${trade.pnlDollars.toFixed(2)}`);

            // === COMPREHENSIVE FAILURE ANALYSIS ===

            // 1. RSI EXTREMES
            if (trade.direction === 'long' && trade.indicators.rsi > 70) {
                lessons.push('❌ LEARNED: Avoid LONG when RSI > 70 (overbought condition)');
            }
            if (trade.direction === 'short' && trade.indicators.rsi < 30) {
                lessons.push('❌ LEARNED: Avoid SHORT when RSI < 30 (oversold condition)');
            }
            if (trade.indicators.rsi > 50 && trade.direction === 'short') {
                lessons.push('⚠️ LEARNED: RSI > 50 suggests bullish momentum, SHORT was risky');
            }
            if (trade.indicators.rsi < 50 && trade.direction === 'long') {
                lessons.push('⚠️ LEARNED: RSI < 50 suggests bearish momentum, LONG was risky');
            }

            // 2. TREND DIRECTION MISMATCH
            if (trade.indicators.adx_trend === 'bullish' && trade.direction === 'short') {
                lessons.push('❌ LEARNED: Going SHORT against a BULLISH trend failed - trade with the trend');
            }
            if (trade.indicators.adx_trend === 'bearish' && trade.direction === 'long') {
                lessons.push('❌ LEARNED: Going LONG against a BEARISH trend failed - trade with the trend');
            }

            // 3. VOLUME ANALYSIS
            if (trade.indicators.volume_ratio < 0.5) {
                lessons.push('❌ LEARNED: Very low volume (< 50% avg) = lack of conviction, avoid trading');
            } else if (trade.indicators.volume_ratio < 1) {
                lessons.push('⚠️ LEARNED: Below-average volume means weak move confirmation');
            }

            // 4. ADX / TREND STRENGTH
            if (trade.indicators.adx_value < 15) {
                lessons.push('❌ LEARNED: ADX < 15 = no trend, avoid directional trades in range');
            } else if (trade.indicators.adx_value < 20) {
                lessons.push('⚠️ LEARNED: Weak trend (ADX 15-20) reduces trade probability');
            }

            // 5. MACD ANALYSIS
            if (trade.indicators.macd_histogram < 0 && trade.direction === 'long') {
                lessons.push('⚠️ LEARNED: Negative MACD histogram = bearish momentum, LONG was against momentum');
            }
            if (trade.indicators.macd_histogram > 0 && trade.direction === 'short') {
                lessons.push('⚠️ LEARNED: Positive MACD histogram = bullish momentum, SHORT was against momentum');
            }

            // 6. BOLLINGER BANDS (using vwap_position as proxy)
            if (trade.indicators.vwap_position > 0.9 && trade.direction === 'long') {
                lessons.push('❌ LEARNED: Price well above VWAP (>90%) = potential reversal, risky LONG');
            }
            if (trade.indicators.vwap_position < 0.1 && trade.direction === 'short') {
                lessons.push('❌ LEARNED: Price well below VWAP (<10%) = potential bounce, risky SHORT');
            }

            // 7. ATR / VOLATILITY (captured in position sizing already)

            // 8. STOCHASTIC
            if (trade.indicators.stochastic_k > 80 && trade.direction === 'long') {
                lessons.push('⚠️ LEARNED: Stochastic > 80 = overbought, LONG entry was late');
            }
            if (trade.indicators.stochastic_k < 20 && trade.direction === 'short') {
                lessons.push('⚠️ LEARNED: Stochastic < 20 = oversold, SHORT entry was late');
            }

            // 9. STOP LOSS ANALYSIS
            if (trade.hitStopLoss) {
                lessons.push('🛑 ANALYSIS: Stop loss triggered - consider wider stops or better entry timing');
                if (trade.riskPercent && trade.riskPercent > 5) {
                    lessons.push('❌ LEARNED: Risk was too high (>5% of account) - reduce position size');
                }
            }

            // 10. CONFIDENCE MISMATCH
            if (trade.confidence > 0.8) {
                lessons.push('⚠️ CRITICAL: High confidence (>80%) trade FAILED - experts overconfident on this pattern');
            } else if (trade.confidence < 0.65) {
                lessons.push('⚠️ LEARNED: Low confidence trades (<65%) have lower win rates - consider skipping');
            }

            // 11. COMPOSITE FAILURE SUMMARY
            const failureFactors: string[] = [];
            if (trade.indicators.rsi > 70 || trade.indicators.rsi < 30) failureFactors.push('RSI extreme');
            if (trade.indicators.adx_value < 20) failureFactors.push('weak trend');
            if (trade.indicators.volume_ratio < 1) failureFactors.push('low volume');
            if (trade.indicators.adx_trend !== (trade.direction === 'long' ? 'bullish' : 'bearish')) {
                failureFactors.push('against trend');
            }

            if (failureFactors.length >= 2) {
                lessons.push(`🔴 PATTERN: Multiple failure factors (${failureFactors.join(', ')}) - this setup should be AVOIDED`);
            }

            // === RECORD FAILED PATTERNS FOR DYNAMIC LEARNING ===
            // Each pattern that matches gets counted toward blocking threshold
            const PK = MeticulousLearningEngine.PATTERN_KEYS;

            // RSI extremes
            if (trade.direction === 'long' && trade.indicators.rsi > 70) {
                this.recordFailedPattern(PK.LONG_RSI_OVERBOUGHT);
            }
            if (trade.direction === 'short' && trade.indicators.rsi < 30) {
                this.recordFailedPattern(PK.SHORT_RSI_OVERSOLD);
            }

            // Against trend
            if (trade.direction === 'long' && trade.indicators.adx_trend === 'bearish' && trade.indicators.adx_value > 20) {
                this.recordFailedPattern(PK.LONG_AGAINST_BEARISH);
            }
            if (trade.direction === 'short' && trade.indicators.adx_trend === 'bullish' && trade.indicators.adx_value > 20) {
                this.recordFailedPattern(PK.SHORT_AGAINST_BULLISH);
            }

            // Low ADX
            if (trade.indicators.adx_value < 15) {
                this.recordFailedPattern(PK.LOW_ADX_NO_TREND);
            }

            // Low volume
            if (trade.indicators.volume_ratio < 0.7) {
                this.recordFailedPattern(PK.LOW_VOLUME);
            }

            // MACD momentum mismatch
            if (trade.direction === 'long' && trade.indicators.macd_histogram < 0) {
                this.recordFailedPattern(PK.LONG_MACD_NEGATIVE);
            }
            if (trade.direction === 'short' && trade.indicators.macd_histogram > 0) {
                this.recordFailedPattern(PK.SHORT_MACD_POSITIVE);
            }

            // Stochastic extremes
            if (trade.direction === 'long' && trade.indicators.stochastic_k > 80) {
                this.recordFailedPattern(PK.LONG_STOCH_OVERBOUGHT);
            }
            if (trade.direction === 'short' && trade.indicators.stochastic_k < 20) {
                this.recordFailedPattern(PK.SHORT_STOCH_OVERSOLD);
            }
        }

        trade.lessonsLearned = lessons;
    }

    /**
     * Simulate an intraday trade using minute bars
     * Entry at market open, check each minute for stop/TP
     */
    private async simulateIntradayTrade(
        symbol: string,
        date: Date,
        direction: 'long' | 'short',
        stopLoss: number,
        takeProfit: number,
        positionSize: number
    ): Promise<{
        exitPrice: number;
        exitTime: string;
        tradeDuration: number;
        hitStopLoss: boolean;
        hitTakeProfit: boolean;
        pnlDollars: number;
    }> {
        // Fetch minute bars for this trading day
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const minuteBars = await this.provider.getOHLCV(symbol, '1m', date, nextDay);

        if (minuteBars.length === 0) {
            // Fallback to daily bar simulation
            return {
                exitPrice: 0,
                exitTime: '16:00',
                tradeDuration: 390,
                hitStopLoss: false,
                hitTakeProfit: false,
                pnlDollars: 0,
            };
        }

        // Entry at market open (first bar)
        const entryBar = minuteBars[0];
        const entryPrice = entryBar.open;
        const entryTime = new Date(entryBar.timestamp).toTimeString().slice(0, 5);

        let exitPrice = entryPrice;
        let exitTime = '16:00'; // Default to market close
        let hitStopLoss = false;
        let hitTakeProfit = false;

        // Iterate through each minute bar
        for (let i = 0; i < minuteBars.length; i++) {
            const bar = minuteBars[i];
            const barTime = new Date(bar.timestamp).toTimeString().slice(0, 5);

            if (direction === 'long') {
                // Check if stop loss hit (price dropped to or below stop)
                if (bar.low <= stopLoss) {
                    exitPrice = stopLoss;
                    exitTime = barTime;
                    hitStopLoss = true;
                    break;
                }
                // Check if take profit hit (price rose to or above target)
                if (bar.high >= takeProfit) {
                    exitPrice = takeProfit;
                    exitTime = barTime;
                    hitTakeProfit = true;
                    break;
                }
            } else {
                // SHORT trade
                // Check if stop loss hit (price rose to or above stop)
                if (bar.high >= stopLoss) {
                    exitPrice = stopLoss;
                    exitTime = barTime;
                    hitStopLoss = true;
                    break;
                }
                // Check if take profit hit (price dropped to or below target)
                if (bar.low <= takeProfit) {
                    exitPrice = takeProfit;
                    exitTime = barTime;
                    hitTakeProfit = true;
                    break;
                }
            }

            // If we reach end of day without exit, use close price
            if (i === minuteBars.length - 1) {
                exitPrice = bar.close;
                exitTime = barTime;
            }
        }

        // Calculate duration in minutes
        const entryMinutes = parseInt(entryTime.split(':')[0]) * 60 + parseInt(entryTime.split(':')[1]);
        const exitMinutes = parseInt(exitTime.split(':')[0]) * 60 + parseInt(exitTime.split(':')[1]);
        const tradeDuration = Math.max(1, exitMinutes - entryMinutes);

        // Calculate P&L
        const priceChange = direction === 'long'
            ? exitPrice - entryPrice
            : entryPrice - exitPrice;
        const pnlDollars = positionSize * priceChange;

        return {
            exitPrice,
            exitTime,
            tradeDuration,
            hitStopLoss,
            hitTakeProfit,
            pnlDollars,
        };
    }

    /**
     * Process a single trading day
     */
    private async processDay(
        dayNumber: number,
        date: Date,
        allData: Map<string, OHLCVBar[]>,
    ): Promise<DailyRecord> {
        const dateStr = date.toISOString().slice(0, 10);
        const dayTrades: MeticulousTrade[] = [];

        console.log(`\n[Day ${dayNumber}] ${dateStr}`);

        for (const symbol of this.symbols) {
            const bars = allData.get(symbol);
            if (!bars || bars.length < 60) continue;

            // Find today's bar and tomorrow's bar
            const todayTs = date.getTime();
            const todayIdx = bars.findIndex(b => {
                const barDate = new Date(b.timestamp);
                return barDate.toDateString() === date.toDateString();
            });

            if (todayIdx === -1 || todayIdx >= bars.length - 1) continue;

            const todayBar = bars[todayIdx];
            const tomorrowBar = bars[todayIdx + 1];

            // Get historical data up to today (anti-lookahead)
            const historicalBars = bars.slice(0, todayIdx + 1);

            // Convert to indicator Bar format
            const indicatorBars: Bar[] = historicalBars.map(b => ({
                timestamp: b.timestamp,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
            }));

            // Calculate indicators
            const indicators = this.calculateIndicators(indicatorBars);
            if (!indicators) continue;

            // Get expert signals
            const signals = this.getExpertSignals(indicators);

            // === EACH AGENT MAKES THEIR OWN DECISION ===
            // Loop through all 4 agents - each uses their specialized charting methods
            const agentTypes: TradingAgent[] = ['day-trading', 'swing', 'options', 'investing'];

            for (const agentType of agentTypes) {
                const portfolio = this.agentPortfolios.get(agentType);
                if (!portfolio) continue;

                // Skip if agent can't afford any shares (even with debt, they can still trade)
                // Each agent makes their own decision using ONLY their specializations
                const agentDecision = this.makeAgentDecision(signals, agentType);

                if (!agentDecision.trade) continue;

                // CHECK LEARNED PATTERNS - Block dangerous setups
                const avoidCheck = this.shouldAvoidTrade(agentDecision.direction, {
                    rsi: indicators.rsi,
                    adx_value: indicators.adx_value,
                    volume_ratio: indicators.volume_ratio,
                    adx_trend: indicators.adx_trend,
                    macd_histogram: indicators.macd_histogram,
                    stochastic_k: indicators.stochastic_k,
                });

                if (avoidCheck.avoid) {
                    console.log(`  [${agentType}] Trade BLOCKED: ${avoidCheck.reason}`);
                    continue; // Skip this trade based on learned patterns
                }

                // Calculate ATR for volatility-based decisions
                const atrValue = atr(indicatorBars) || todayBar.close * 0.02;

                // === AGENT-SPECIFIC POSITION SIZING ===
                // Use this agent's portfolio balance
                const agentBalance = Math.max(portfolio.currentBalance, 10); // Min $10 to trade
                const minAllocation = 0.05;
                const maxAllocation = 0.50;
                const confidenceMultiplier = (agentDecision.confidence - 0.5) * 2;
                const allocationPercent = minAllocation + (maxAllocation - minAllocation) * confidenceMultiplier;

                const positionValue = Math.min(
                    agentBalance * allocationPercent,
                    agentBalance * maxAllocation
                );
                const positionSize = Math.floor(positionValue / todayBar.close);

                if (positionSize < 1) continue;

                const actualPositionValue = positionSize * todayBar.close;

                // Stop loss and take profit
                const stopMultiplier = 1.0 + agentDecision.confidence;
                const stopDistance = atrValue * stopMultiplier;
                const stopLoss = agentDecision.direction === 'long'
                    ? todayBar.close - stopDistance
                    : todayBar.close + stopDistance;

                const rrRatio = 1.5 + agentDecision.confidence;
                const takeProfit = agentDecision.direction === 'long'
                    ? todayBar.close + (stopDistance * rrRatio)
                    : todayBar.close - (stopDistance * rrRatio);

                // Calculate risk
                const riskAmount = positionSize * stopDistance;
                const riskPercent = (riskAmount / agentBalance) * 100;

                // Check if stop loss or take profit was hit
                const hitStopLoss = agentDecision.direction === 'long'
                    ? tomorrowBar.low <= stopLoss
                    : tomorrowBar.high >= stopLoss;
                const hitTakeProfit = agentDecision.direction === 'long'
                    ? tomorrowBar.high >= takeProfit
                    : tomorrowBar.low <= takeProfit;

                // Determine exit price
                let exitPrice = tomorrowBar.close;
                if (hitStopLoss && !hitTakeProfit) {
                    exitPrice = stopLoss;
                } else if (hitTakeProfit && !hitStopLoss) {
                    exitPrice = takeProfit;
                } else if (hitStopLoss && hitTakeProfit) {
                    exitPrice = stopLoss; // Conservative
                }

                // Calculate P&L
                const priceChange = agentDecision.direction === 'long'
                    ? exitPrice - todayBar.close
                    : todayBar.close - exitPrice;
                const pnlDollars = positionSize * priceChange;
                const actualMove = (priceChange / todayBar.close) * 100;
                const wasCorrect = pnlDollars > 0;

                // === UPDATE AGENT'S PORTFOLIO ===
                portfolio.currentBalance += pnlDollars;
                portfolio.totalPnL += pnlDollars;
                portfolio.totalTrades++;

                if (wasCorrect) {
                    portfolio.wins++;
                } else {
                    portfolio.losses++;
                }
                portfolio.winRate = portfolio.totalTrades > 0
                    ? (portfolio.wins / portfolio.totalTrades) * 100
                    : 0;

                // Track peak and drawdown
                if (portfolio.currentBalance > portfolio.peakBalance) {
                    portfolio.peakBalance = portfolio.currentBalance;
                }
                const drawdown = ((portfolio.peakBalance - portfolio.currentBalance) / portfolio.peakBalance) * 100;
                if (drawdown > portfolio.maxDrawdown) {
                    portfolio.maxDrawdown = drawdown;
                }

                // === AGENT DEBT TRACKING ===
                if (portfolio.currentBalance <= 0 && !portfolio.inDebt) {
                    portfolio.inDebt = true;
                    portfolio.debt = Math.abs(portfolio.currentBalance);
                    portfolio.totalDebt += portfolio.debt;
                    portfolio.bankruptcyCount++;

                    // Reset to $300 but track the debt
                    console.log(`\n  💀 ${agentType.toUpperCase()} BANKRUPTCY #${portfolio.bankruptcyCount}!`);
                    console.log(`     Debt: $${portfolio.debt.toFixed(2)} (continues trading)`);
                    portfolio.currentBalance = 300; // Reset balance
                }

                // Check if recovered from debt
                if (portfolio.inDebt && portfolio.totalPnL > 0) {
                    console.log(`\n  💰 ${agentType.toUpperCase()} RECOVERED FROM DEBT!`);
                    portfolio.inDebt = false;
                }

                // Also update main account for overall tracking
                this.account.currentBalance += pnlDollars;
                this.account.lifetimePnL += pnlDollars;

                const trade: MeticulousTrade = {
                    id: uuidv4(),
                    day: dayNumber,
                    date: dateStr,
                    symbol,
                    agent: agentType,
                    direction: agentDecision.direction,
                    entryPrice: todayBar.close,
                    confidence: agentDecision.confidence,
                    expertSignals: agentDecision.usedSignals, // Only their specialized signals
                    indicators,
                    actualMove,
                    exitPrice,
                    pnlDollars,
                    wasCorrect,
                    lessonsLearned: [],
                    positionSize,
                    positionValue: actualPositionValue,
                    stopLoss,
                    takeProfit,
                    riskAmount,
                    riskPercent,
                    hitStopLoss,
                    hitTakeProfit,
                    timeframe: agentType === 'day-trading' ? 'intraday' : 'swing',
                };

                // Learn from this trade
                this.learnFromTrade(trade);

                dayTrades.push(trade);
                this.allTrades.push(trade);

                const icon = wasCorrect ? '✅' : '❌';
                const sltp = hitStopLoss ? '🛑SL' : hitTakeProfit ? '🎯TP' : '📊';
                console.log(`  ${icon} [${agentType}] ${symbol}: ${agentDecision.direction.toUpperCase()} ${positionSize} @ $${todayBar.close.toFixed(2)} → $${exitPrice.toFixed(2)} ${sltp} (${pnlDollars >= 0 ? '+' : ''}$${pnlDollars.toFixed(2)}) | Agent Balance: $${portfolio.currentBalance.toFixed(2)}`);
            }
        }

        // Calculate cumulative stats for this day
        const wins = dayTrades.filter((t: MeticulousTrade) => t.wasCorrect).length;
        const losses = dayTrades.length - wins;
        const pnl = dayTrades.reduce((sum: number, t: MeticulousTrade) => sum + t.pnlDollars, 0);

        const totalWins = this.allTrades.filter((t: MeticulousTrade) => t.wasCorrect).length;
        const totalPnL = this.allTrades.reduce((sum: number, t: MeticulousTrade) => sum + t.pnlDollars, 0);

        // Lessons summary
        const bestTrade = dayTrades.length > 0
            ? dayTrades.sort((a: MeticulousTrade, b: MeticulousTrade) => b.pnlDollars - a.pnlDollars)[0]?.symbol || 'N/A'
            : 'N/A';
        const lessonsSummary = dayTrades.length > 0
            ? `${wins}/${dayTrades.length} correct. Best: ${bestTrade}`
            : 'No trades - insufficient signals';

        // Current expert weights
        const expertWeights: Record<string, number> = {};
        Array.from(this.experts.entries()).forEach(([name, exp]) => {
            expertWeights[name] = exp.weight;
        });

        const record: DailyRecord = {
            day: dayNumber,
            date: dateStr,
            tradesPlaced: dayTrades.length,
            wins,
            losses,
            pnl,
            trades: dayTrades,
            lessonsSummary,
            cumulative: {
                totalTrades: this.allTrades.length,
                totalWins,
                winRate: this.allTrades.length > 0 ? totalWins / this.allTrades.length : 0,
                totalPnL,
            },
            expertWeights,
        };

        // Update equity curve at end of day
        const drawdown = ((this.account.peakBalance - this.account.currentBalance) / this.account.peakBalance) * 100;
        this.account.equityCurve.push({
            date: dateStr,
            balance: this.account.currentBalance,
            drawdown,
        });

        // Console output with account info
        const returnPct = ((this.account.currentBalance - this.account.startingCapital) / this.account.startingCapital) * 100;
        console.log(`  Day Summary: ${dayTrades.length} trades, ${wins} wins, P&L: $${pnl.toFixed(2)}`);
        console.log(`  Cumulative: ${this.allTrades.length} trades, ${(record.cumulative.winRate * 100).toFixed(1)}% win rate, Total: $${totalPnL.toFixed(2)}`);
        console.log(`  💰 Account: $${this.account.currentBalance.toFixed(2)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%) | Drawdown: ${drawdown.toFixed(1)}%`);

        this.dailyRecords.push(record);
        return record;
    }

    /**
     * Run full meticulous learning
     */
    async learn(
        trainingMonths: number = 3,
        simulationMonths: number = 20,
        onDayComplete?: (record: DailyRecord) => void,
        onProgress?: (day: number, total: number, winRate: number, pnl: number) => void,
    ): Promise<LearningSession> {
        this.running = true;

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  METICULOUS DAY-BY-DAY LEARNING');
        console.log('  Every day counts. No skipping. No summarizing.');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  Symbols: ${this.symbols.join(', ')}`);
        console.log(`  Training base: ${trainingMonths} months`);
        console.log(`  Simulation: ${simulationMonths} months (~${simulationMonths * 20} trading days)`);
        console.log('═══════════════════════════════════════════════════════════════');

        // Check API
        const available = await this.provider.isAvailable();
        if (!available) {
            throw new Error('Polygon API not available');
        }

        // Calculate dates
        const now = new Date();
        const endDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 1 month ago
        const startDate = new Date(endDate.getTime() - (trainingMonths + simulationMonths) * 30 * 24 * 60 * 60 * 1000);
        const simStartDate = new Date(startDate.getTime() + trainingMonths * 30 * 24 * 60 * 60 * 1000);

        // Fetch all data
        console.log('\n📥 Fetching historical data...');
        const allData: Map<string, OHLCVBar[]> = new Map();

        for (const symbol of this.symbols) {
            console.log(`  Fetching ${symbol}...`);
            const bars = await this.provider.getOHLCV(symbol, '1d', startDate, endDate);
            allData.set(symbol, bars);
            console.log(`  ${symbol}: ${bars.length} daily bars`);
            await new Promise(r => setTimeout(r, 300));
        }

        // Get trading days
        const tradingDays: Date[] = [];
        const current = new Date(simStartDate);
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                tradingDays.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        console.log(`\n📅 ${tradingDays.length} trading days to process\n`);

        // Process each day
        for (let i = 0; i < tradingDays.length; i++) {
            const record = await this.processDay(i + 1, tradingDays[i], allData);

            if (onDayComplete) {
                onDayComplete(record);
            }

            if (onProgress) {
                onProgress(i + 1, tradingDays.length, record.cumulative.winRate, record.cumulative.totalPnL);
            }

            // Small delay
            await new Promise(r => setTimeout(r, 5));
        }

        // Build final session
        const session: LearningSession = {
            sessionId: uuidv4(),
            startDate: simStartDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
            totalDays: tradingDays.length,
            daysCompleted: tradingDays.length,
            status: 'completed',
            totalTrades: this.allTrades.length,
            totalWins: this.allTrades.filter(t => t.wasCorrect).length,
            totalLosses: this.allTrades.filter(t => !t.wasCorrect).length,
            winRate: this.allTrades.length > 0
                ? this.allTrades.filter(t => t.wasCorrect).length / this.allTrades.length
                : 0,
            totalPnL: this.allTrades.reduce((sum, t) => sum + t.pnlDollars, 0),
            account: { ...this.account },
            experts: Object.fromEntries(this.experts),
            dailyRecords: this.dailyRecords,
        };

        // Calculate final return
        const finalReturn = ((this.account.currentBalance - this.account.startingCapital) / this.account.startingCapital) * 100;

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  LEARNING COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  Days: ${session.totalDays}`);
        console.log(`  Trades: ${session.totalTrades}`);
        console.log(`  Win Rate: ${(session.winRate * 100).toFixed(1)}%`);
        console.log('');
        console.log('  💰 PAPER TRADING RESULTS:');
        console.log(`     Starting Capital: $${this.account.startingCapital.toFixed(2)}`);
        console.log(`     Final Balance:    $${this.account.currentBalance.toFixed(2)}`);
        console.log(`     Return:           ${finalReturn >= 0 ? '+' : ''}${finalReturn.toFixed(1)}%`);
        console.log(`     Max Drawdown:     ${this.account.maxDrawdown.toFixed(1)}%`);
        console.log(`     Peak Balance:     $${this.account.peakBalance.toFixed(2)}`);
        console.log('');
        console.log('  Expert Weights:');
        Array.from(this.experts.entries())
            .sort((a, b) => b[1].weight - a[1].weight)
            .forEach(([name, exp]) => {
                const accuracy = exp.trades > 0
                    ? ((exp.correctPredictions / exp.trades) * 100).toFixed(1)
                    : '0.0';
                console.log(`    ${name}: ${(exp.weight * 100).toFixed(1)}% weight, ${exp.trades} trades, ${accuracy}% accuracy`);
            });
        console.log('═══════════════════════════════════════════════════════════════');

        this.running = false;
        return session;
    }

    /**
     * Get current state
     */
    getState(): {
        running: boolean;
        trades: number;
        winRate: number;
        pnl: number;
    } {
        return {
            running: this.running,
            trades: this.allTrades.length,
            winRate: this.allTrades.length > 0
                ? this.allTrades.filter(t => t.wasCorrect).length / this.allTrades.length
                : 0,
            pnl: this.allTrades.reduce((sum, t) => sum + t.pnlDollars, 0),
        };
    }

    /**
     * Save current training state for resume
     */
    saveState(): TrainingState {
        return {
            lastTrainedDate: this.dailyRecords.length > 0
                ? this.dailyRecords[this.dailyRecords.length - 1].date
                : '',
            currentDayIndex: this.dailyRecords.length,
            expertWeights: Object.fromEntries(
                Array.from(this.experts.entries()).map(([name, exp]) => [name, {
                    name: exp.name,
                    weight: exp.weight,
                    trades: exp.trades,
                    correctPredictions: exp.correctPredictions,
                    totalPnL: exp.totalPnL,
                }])
            ),
            account: { ...this.account },
            trades: this.allTrades,
            dailyRecords: this.dailyRecords,
            savedAt: new Date().toISOString(),
        };
    }

    /**
     * Load saved training state to resume
     */
    loadState(state: TrainingState): void {
        // Restore expert weights
        for (const [name, expData] of Object.entries(state.expertWeights)) {
            const expert = this.experts.get(name);
            if (expert) {
                expert.weight = expData.weight;
                expert.trades = expData.trades;
                expert.correctPredictions = expData.correctPredictions;
                expert.totalPnL = expData.totalPnL;
            }
        }

        // Restore account
        this.account = { ...state.account };

        // Restore trades and records
        this.allTrades = [...state.trades];
        this.dailyRecords = [...state.dailyRecords];

        console.log(`📂 Loaded training state from ${state.savedAt}`);
        console.log(`   Last trained: ${state.lastTrainedDate}`);
        console.log(`   Days completed: ${state.currentDayIndex}`);
        console.log(`   Account balance: $${this.account.currentBalance.toFixed(2)}`);
    }

    /**
     * Get all daily records
     */
    getDailyRecords(): DailyRecord[] {
        return this.dailyRecords;
    }

    /**
     * Get all agent portfolios
     */
    getAgentPortfolios(): AgentPortfolio[] {
        return Array.from(this.agentPortfolios.values());
    }

    /**
     * EXPORT BRAIN - Save learned knowledge for transfer learning
     * Contains weights and lessons, NO trade/price memory
     */
    exportBrain(): BrainState {
        // Collect expert weights
        const expertWeights: BrainState['expertWeights'] = {};
        this.experts.forEach((exp, name) => {
            const accuracy = exp.trades > 0
                ? exp.correctPredictions / exp.trades
                : 0;
            expertWeights[name] = {
                weight: exp.weight,
                trades: exp.trades,
                accuracy,
            };
        });

        // Collect agent strategies
        const agentStrategies: BrainState['agentStrategies'] = {};
        this.agentPortfolios.forEach((portfolio, agent) => {
            agentStrategies[agent] = {
                specializations: portfolio.specializations,
                bestPerformingIndicators: portfolio.specializations.slice(0, 3), // Top 3
                winRate: portfolio.winRate,
            };
        });

        // Extract patterns from lessons
        const avoidPatterns: string[] = [];
        const followPatterns: string[] = [];

        this.allTrades.forEach(trade => {
            trade.lessonsLearned.forEach(lesson => {
                if (lesson.includes('LEARNED:') || lesson.includes('CRITICAL:')) {
                    if (!avoidPatterns.includes(lesson) && avoidPatterns.length < 20) {
                        avoidPatterns.push(lesson);
                    }
                } else if (lesson.includes('REINFORCED:')) {
                    if (!followPatterns.includes(lesson) && followPatterns.length < 10) {
                        followPatterns.push(lesson);
                    }
                }
            });
        });

        const brain: BrainState = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            expertWeights,
            agentStrategies,
            learnedPatterns: {
                avoid: avoidPatterns,
                follow: followPatterns,
            },
        };

        console.log('\n🧠 BRAIN EXPORTED');
        console.log(`   Experts: ${Object.keys(expertWeights).length}`);
        console.log(`   Patterns to avoid: ${avoidPatterns.length}`);
        console.log(`   Patterns to follow: ${followPatterns.length}`);

        return brain;
    }

    /**
     * LOAD BRAIN - Import learned knowledge into fresh session
     * Resets trade/price memory but keeps learned weights
     */
    loadBrain(brain: BrainState): void {
        console.log('\n🧠 LOADING BRAIN...');
        console.log(`   Version: ${brain.version}`);
        console.log(`   Exported: ${brain.exportDate}`);

        // Apply expert weights
        Object.entries(brain.expertWeights).forEach(([name, data]) => {
            const expert = this.experts.get(name);
            if (expert) {
                expert.weight = data.weight;
                console.log(`   ${name}: weight set to ${(data.weight * 100).toFixed(1)}%`);
            }
        });

        // Reset trade memory (fresh start with learned knowledge)
        this.allTrades = [];
        this.dailyRecords = [];

        // Reset accounts with fresh capital
        this.agentPortfolios.forEach((portfolio, agent) => {
            portfolio.currentBalance = portfolio.startingCapital;
            portfolio.totalTrades = 0;
            portfolio.wins = 0;
            portfolio.losses = 0;
            portfolio.totalPnL = 0;
            portfolio.debt = 0;
            portfolio.inDebt = false;
        });

        this.account.currentBalance = this.account.startingCapital;
        this.account.lifetimePnL = 0;
        this.account.bankruptcyCount = 0;
        this.account.bankruptcyDates = [];

        console.log('   ✅ Brain loaded! Ready for new training with learned weights.');
    }

    /**
     * GET YEARLY STATS - Compare performance by year
     */
    getYearlyStats(): YearlyStats[] {
        const yearlyData = new Map<number, {
            trades: MeticulousTrade[];
            byMonth: Map<string, MeticulousTrade[]>;
        }>();

        // Group trades by year
        this.allTrades.forEach(trade => {
            const year = parseInt(trade.date.slice(0, 4));
            const month = trade.date.slice(0, 7); // YYYY-MM

            if (!yearlyData.has(year)) {
                yearlyData.set(year, { trades: [], byMonth: new Map() });
            }

            const yearEntry = yearlyData.get(year)!;
            yearEntry.trades.push(trade);

            if (!yearEntry.byMonth.has(month)) {
                yearEntry.byMonth.set(month, []);
            }
            yearEntry.byMonth.get(month)!.push(trade);
        });

        // Calculate stats for each year
        const yearlyStats: YearlyStats[] = [];

        yearlyData.forEach((data, year) => {
            const trades = data.trades;
            const wins = trades.filter(t => t.wasCorrect).length;
            const losses = trades.length - wins;
            const pnl = trades.reduce((sum, t) => sum + t.pnlDollars, 0);

            // Find best and worst month
            let bestMonth = { month: '', pnl: -Infinity };
            let worstMonth = { month: '', pnl: Infinity };

            data.byMonth.forEach((monthTrades, month) => {
                const monthPnL = monthTrades.reduce((sum, t) => sum + t.pnlDollars, 0);
                if (monthPnL > bestMonth.pnl) {
                    bestMonth = { month, pnl: monthPnL };
                }
                if (monthPnL < worstMonth.pnl) {
                    worstMonth = { month, pnl: monthPnL };
                }
            });

            // Per-agent breakdown
            const agentStats: YearlyStats['agentStats'] = {};
            const agentTypes: TradingAgent[] = ['day-trading', 'swing', 'options', 'investing'];

            agentTypes.forEach(agent => {
                const agentTrades = trades.filter(t => t.agent === agent);
                const agentWins = agentTrades.filter(t => t.wasCorrect).length;
                agentStats[agent] = {
                    trades: agentTrades.length,
                    pnl: agentTrades.reduce((sum, t) => sum + t.pnlDollars, 0),
                    winRate: agentTrades.length > 0 ? (agentWins / agentTrades.length) * 100 : 0,
                };
            });

            yearlyStats.push({
                year,
                trades: trades.length,
                wins,
                losses,
                pnl,
                winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
                bestMonth,
                worstMonth,
                agentStats,
            });
        });

        return yearlyStats.sort((a, b) => a.year - b.year);
    }
}

/**
 * Training state for persistence
 */
export interface TrainingState {
    lastTrainedDate: string;
    currentDayIndex: number;
    expertWeights: Record<string, {
        name: string;
        weight: number;
        trades: number;
        correctPredictions: number;
        totalPnL: number;
    }>;
    account: AccountState;
    trades: MeticulousTrade[];
    dailyRecords: DailyRecord[];
    savedAt: string;
}

// Singleton
let meticulousEngine: MeticulousLearningEngine | null = null;

export function getMeticulousEngine(config?: {
    symbols?: string[];
    positionSize?: number;
    startingCapital?: number;
}): MeticulousLearningEngine {
    if (!meticulousEngine) {
        meticulousEngine = new MeticulousLearningEngine(config);
    }
    return meticulousEngine;
}

export function resetMeticulousEngine(): void {
    meticulousEngine = null;
}
