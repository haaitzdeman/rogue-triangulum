/**
 * Daily Trade Simulation Engine
 * 
 * Simulates trading day-by-day over historical data.
 * Each day:
 *   1. Load market data up to that day (anti-lookahead)
 *   2. Each expert analyzes and proposes trades
 *   3. Trades are logged with entry price
 *   4. Next day: compare to actual results
 *   5. Score each trade as win/loss with P&L
 * 
 * This creates a detailed trade log for every single day.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DeskType, MarketContext } from '../core/types';
import { getOrchestrator } from '../core/orchestrator';
import { PolygonTrainingProvider } from './polygon-provider';
import type { OHLCVBar } from './provider-adapter';
import { DayTradingBrain, OptionsBrain, SwingBrain, InvestingBrain } from '../brains';

/**
 * Individual trade record
 */
export interface TradeRecord {
    id: string;
    date: string;              // YYYY-MM-DD
    symbol: string;
    desk: DeskType;
    expertName: string;

    // Entry
    direction: 'long' | 'short' | 'neutral';
    entryPrice: number;
    confidence: number;
    reasoning: string;

    // Exit (filled after evaluation)
    exitPrice?: number;
    exitDate?: string;

    // Result
    pnlPercent?: number;
    pnlDollars?: number;       // Assuming $1000 position
    result?: 'win' | 'loss' | 'breakeven';

    // Learning
    wasCorrect?: boolean;
    lessonLearned?: string;
}

/**
 * Daily summary
 */
export interface DailySummary {
    date: string;
    tradesPlaced: number;
    tradesWon: number;
    tradesLost: number;
    totalPnL: number;
    winRate: number;
    expertBreakdown: Record<string, {
        trades: number;
        wins: number;
        pnl: number;
    }>;
}

/**
 * Simulation progress
 */
export interface SimulationProgress {
    currentDate: string;
    daysCompleted: number;
    totalDays: number;
    totalTrades: number;
    totalPnL: number;
    winRate: number;
    status: 'running' | 'completed' | 'failed';
}

/**
 * Full simulation results
 */
export interface SimulationResults {
    startDate: string;
    endDate: string;

    // Overall
    totalDays: number;
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    winRate: number;
    totalPnL: number;

    // By expert
    expertPerformance: Record<string, {
        trades: number;
        wins: number;
        losses: number;
        winRate: number;
        totalPnL: number;
        avgPnL: number;
    }>;

    // By symbol
    symbolPerformance: Record<string, {
        trades: number;
        wins: number;
        pnl: number;
    }>;

    // Logs
    allTrades: TradeRecord[];
    dailySummaries: DailySummary[];
}

/**
 * Simulation config
 */
export interface SimulationConfig {
    // Base training period (fed first, no trades)
    trainingMonths: number;

    // Simulation period
    startDate: Date;
    endDate: Date;

    // Symbols to trade
    symbols: string[];

    // Which desks use
    desks: DeskType[];

    // Trade parameters
    positionSize: number;      // $ per trade
    maxTradesPerDay: number;   // Per symbol
    minConfidence: number;     // Only trade if confidence > this
}

const DEFAULT_CONFIG: SimulationConfig = {
    trainingMonths: 3,
    startDate: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000), // 24 months ago
    endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),        // 1 month ago
    symbols: ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT'],
    desks: ['day-trading'],
    positionSize: 1000,
    maxTradesPerDay: 2,
    minConfidence: 0.4,
};

/**
 * Daily Trade Simulator
 */
export class DailyTradeSimulator {
    private config: SimulationConfig;
    private provider: PolygonTrainingProvider;
    private brainsRegistered = false;

    // Results
    private trades: TradeRecord[] = [];
    private dailySummaries: DailySummary[] = [];
    private expertStats: Map<string, { trades: number; wins: number; pnl: number }> = new Map();

    constructor(config?: Partial<SimulationConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.provider = new PolygonTrainingProvider();
    }

    /**
     * Register brains
     */
    private ensureBrains(): void {
        if (this.brainsRegistered) return;

        const orchestrator = getOrchestrator();
        orchestrator.registerBrain(new DayTradingBrain());
        orchestrator.registerBrain(new OptionsBrain());
        orchestrator.registerBrain(new SwingBrain());
        orchestrator.registerBrain(new InvestingBrain());

        this.brainsRegistered = true;
    }

    /**
     * Get trading days between two dates
     */
    private getTradingDays(start: Date, end: Date): Date[] {
        const days: Date[] = [];
        const current = new Date(start);

        while (current <= end) {
            const dayOfWeek = current.getDay();
            // Skip weekends
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                days.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        return days;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    /**
     * Simulate a single trading day
     */
    private async simulateDay(
        date: Date,
        historicalData: Map<string, OHLCVBar[]>,
        nextDayData: Map<string, OHLCVBar[]>
    ): Promise<TradeRecord[]> {
        const dayTrades: TradeRecord[] = [];
        const dateStr = this.formatDate(date);

        const orchestrator = getOrchestrator();

        for (const symbol of this.config.symbols) {
            const bars = historicalData.get(symbol) || [];
            const nextBars = nextDayData.get(symbol) || [];

            if (bars.length < 20 || nextBars.length === 0) continue;

            // Get today's close price
            const todayBar = bars[bars.length - 1];
            const nextDayBar = nextBars[0]; // First bar of next day

            // Build context from available data only
            const context: MarketContext = {
                timestamp: todayBar.timestamp,
                marketOpen: true,
                preMarket: false,
                afterHours: false,
                marketRegime: this.inferRegime(bars),
            };

            // Each desk analyzes
            for (const desk of this.config.desks) {
                orchestrator.setActiveDesk(desk);

                try {
                    const prediction = await orchestrator.requestPrediction(symbol, context);

                    if (prediction && prediction.confidence >= this.config.minConfidence) {
                        // Calculate actual result
                        const actualReturn = (nextDayBar.close - todayBar.close) / todayBar.close;
                        const pnlPercent = prediction.direction === 'long'
                            ? actualReturn * 100
                            : prediction.direction === 'short'
                                ? -actualReturn * 100
                                : 0;
                        const pnlDollars = (pnlPercent / 100) * this.config.positionSize;

                        const wasCorrect = (prediction.direction === 'long' && actualReturn > 0) ||
                            (prediction.direction === 'short' && actualReturn < 0);

                        const result: 'win' | 'loss' | 'breakeven' =
                            pnlDollars > 5 ? 'win' : pnlDollars < -5 ? 'loss' : 'breakeven';

                        // Create trade record
                        const trade: TradeRecord = {
                            id: uuidv4(),
                            date: dateStr,
                            symbol,
                            desk,
                            expertName: prediction.expertContributions[0]?.expertName || desk,
                            direction: prediction.direction,
                            entryPrice: todayBar.close,
                            confidence: prediction.confidence,
                            reasoning: prediction.reasons.join('; '),
                            exitPrice: nextDayBar.close,
                            exitDate: this.formatDate(new Date(nextDayBar.timestamp)),
                            pnlPercent,
                            pnlDollars,
                            result,
                            wasCorrect,
                            lessonLearned: wasCorrect
                                ? `✅ ${prediction.direction.toUpperCase()} worked. ${symbol} moved ${(actualReturn * 100).toFixed(2)}%`
                                : `❌ ${prediction.direction.toUpperCase()} failed. ${symbol} moved ${(actualReturn * 100).toFixed(2)}% against position`,
                        };

                        dayTrades.push(trade);

                        // Update expert stats
                        for (const contrib of prediction.expertContributions) {
                            const stats = this.expertStats.get(contrib.expertName) || { trades: 0, wins: 0, pnl: 0 };
                            stats.trades++;
                            if (wasCorrect) stats.wins++;
                            stats.pnl += pnlDollars;
                            this.expertStats.set(contrib.expertName, stats);
                        }
                    }
                } catch (error) {
                    console.warn(`[Simulator] Error for ${symbol} on ${dateStr}:`, error);
                }
            }
        }

        return dayTrades;
    }

    /**
     * Infer market regime
     */
    private inferRegime(bars: OHLCVBar[]): MarketContext['marketRegime'] {
        if (bars.length < 20) return 'neutral';

        const recent = bars.slice(-20);
        const avgClose = recent.reduce((sum, b) => sum + b.close, 0) / recent.length;
        const lastClose = bars[bars.length - 1].close;
        const deviation = (lastClose - avgClose) / avgClose;

        if (deviation > 0.03) return 'risk-on';
        if (deviation < -0.03) return 'risk-off';
        return 'neutral';
    }

    /**
     * Run full simulation
     */
    async runSimulation(
        onProgress?: (progress: SimulationProgress) => void,
        onDayComplete?: (date: string, trades: TradeRecord[]) => void
    ): Promise<SimulationResults> {
        this.ensureBrains();

        console.log('[Simulator] Starting daily trade simulation...');
        console.log(`[Simulator] Period: ${this.formatDate(this.config.startDate)} to ${this.formatDate(this.config.endDate)}`);

        // Check API
        const available = await this.provider.isAvailable();
        if (!available) {
            throw new Error('Polygon API not available');
        }

        // Calculate simulation start (after training period)
        const trainingEndDate = new Date(this.config.startDate);
        trainingEndDate.setMonth(trainingEndDate.getMonth() + this.config.trainingMonths);

        console.log(`[Simulator] Training period: ${this.formatDate(this.config.startDate)} to ${this.formatDate(trainingEndDate)}`);
        console.log(`[Simulator] Simulation period: ${this.formatDate(trainingEndDate)} to ${this.formatDate(this.config.endDate)}`);

        // Get all trading days
        const tradingDays = this.getTradingDays(trainingEndDate, this.config.endDate);
        console.log(`[Simulator] Total trading days to simulate: ${tradingDays.length}`);

        // Fetch all historical data upfront (to avoid repeated API calls)
        const allData: Map<string, OHLCVBar[]> = new Map();

        for (const symbol of this.config.symbols) {
            console.log(`[Simulator] Fetching data for ${symbol}...`);
            const bars = await this.provider.getOHLCV(
                symbol,
                '1d',
                this.config.startDate,
                this.config.endDate
            );
            allData.set(symbol, bars);
            console.log(`[Simulator] Got ${bars.length} daily bars for ${symbol}`);

            // Rate limiting
            await new Promise(r => setTimeout(r, 300));
        }

        // Simulate day by day
        let totalWins = 0;
        let totalLosses = 0;
        let totalPnL = 0;

        for (let i = 0; i < tradingDays.length - 1; i++) {
            const currentDay = tradingDays[i];
            const nextDay = tradingDays[i + 1];
            const dateStr = this.formatDate(currentDay);

            // Get historical data up to current day (anti-lookahead)
            const historicalData: Map<string, OHLCVBar[]> = new Map();
            const nextDayData: Map<string, OHLCVBar[]> = new Map();

            for (const symbol of this.config.symbols) {
                const bars = allData.get(symbol) || [];
                const currentDayTs = currentDay.getTime();
                const nextDayTs = nextDay.getTime();

                // Historical: all bars up to and including current day
                const historical = bars.filter(b => b.timestamp <= currentDayTs + 24 * 60 * 60 * 1000);
                historicalData.set(symbol, historical);

                // Next day: bars for next trading day
                const nextDayBars = bars.filter(b => {
                    const barDate = new Date(b.timestamp);
                    return barDate.toDateString() === nextDay.toDateString();
                });
                nextDayData.set(symbol, nextDayBars);
            }

            // Simulate this day
            const dayTrades = await this.simulateDay(currentDay, historicalData, nextDayData);

            // Add to results
            this.trades.push(...dayTrades);

            // Calculate daily summary
            const dayWins = dayTrades.filter(t => t.result === 'win').length;
            const dayLosses = dayTrades.filter(t => t.result === 'loss').length;
            const dayPnL = dayTrades.reduce((sum, t) => sum + (t.pnlDollars || 0), 0);

            totalWins += dayWins;
            totalLosses += dayLosses;
            totalPnL += dayPnL;

            const dailySummary: DailySummary = {
                date: dateStr,
                tradesPlaced: dayTrades.length,
                tradesWon: dayWins,
                tradesLost: dayLosses,
                totalPnL: dayPnL,
                winRate: dayTrades.length > 0 ? dayWins / dayTrades.length : 0,
                expertBreakdown: {},
            };

            this.dailySummaries.push(dailySummary);

            // Report progress
            if (onProgress) {
                onProgress({
                    currentDate: dateStr,
                    daysCompleted: i + 1,
                    totalDays: tradingDays.length - 1,
                    totalTrades: this.trades.length,
                    totalPnL,
                    winRate: this.trades.length > 0 ? totalWins / this.trades.length : 0,
                    status: 'running',
                });
            }

            if (onDayComplete) {
                onDayComplete(dateStr, dayTrades);
            }

            // Log progress every 20 days
            if ((i + 1) % 20 === 0) {
                console.log(`[Simulator] Day ${i + 1}/${tradingDays.length - 1} | Trades: ${this.trades.length} | Win Rate: ${(totalWins / this.trades.length * 100).toFixed(1)}% | P&L: $${totalPnL.toFixed(2)}`);
            }

            // Small delay to not overwhelm
            await new Promise(r => setTimeout(r, 10));
        }

        // Build expert performance
        const expertPerformance: SimulationResults['expertPerformance'] = {};
        Array.from(this.expertStats.entries()).forEach(([name, stats]) => {
            expertPerformance[name] = {
                trades: stats.trades,
                wins: stats.wins,
                losses: stats.trades - stats.wins,
                winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
                totalPnL: stats.pnl,
                avgPnL: stats.trades > 0 ? stats.pnl / stats.trades : 0,
            };
        });

        // Build symbol performance
        const symbolPerformance: SimulationResults['symbolPerformance'] = {};
        for (const symbol of this.config.symbols) {
            const symbolTrades = this.trades.filter(t => t.symbol === symbol);
            symbolPerformance[symbol] = {
                trades: symbolTrades.length,
                wins: symbolTrades.filter(t => t.result === 'win').length,
                pnl: symbolTrades.reduce((sum, t) => sum + (t.pnlDollars || 0), 0),
            };
        }

        const results: SimulationResults = {
            startDate: this.formatDate(trainingEndDate),
            endDate: this.formatDate(this.config.endDate),
            totalDays: tradingDays.length - 1,
            totalTrades: this.trades.length,
            totalWins,
            totalLosses,
            winRate: this.trades.length > 0 ? totalWins / this.trades.length : 0,
            totalPnL,
            expertPerformance,
            symbolPerformance,
            allTrades: this.trades,
            dailySummaries: this.dailySummaries,
        };

        console.log(`[Simulator] Simulation complete!`);
        console.log(`[Simulator] Days: ${results.totalDays} | Trades: ${results.totalTrades} | Win Rate: ${(results.winRate * 100).toFixed(1)}% | P&L: $${results.totalPnL.toFixed(2)}`);

        return results;
    }

    /**
     * Get current trades
     */
    getTrades(): TradeRecord[] {
        return [...this.trades];
    }

    /**
     * Clear results
     */
    clear(): void {
        this.trades = [];
        this.dailySummaries = [];
        this.expertStats.clear();
    }
}

// Singleton
let simulatorInstance: DailyTradeSimulator | null = null;

export function getDailySimulator(config?: Partial<SimulationConfig>): DailyTradeSimulator {
    if (!simulatorInstance) {
        simulatorInstance = new DailyTradeSimulator(config);
    }
    return simulatorInstance;
}

export function resetDailySimulator(): void {
    simulatorInstance = null;
}
