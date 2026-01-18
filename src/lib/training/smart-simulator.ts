/**
 * Smart Daily Trade Simulation Engine
 * 
 * Uses REAL technical indicators for predictions.
 * Feeds historical data to SmartDayTradingBrain for proper indicator calculation.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DeskType, MarketContext } from '../core/types';
import { PolygonTrainingProvider } from './polygon-provider';
import type { OHLCVBar } from './provider-adapter';
import { SmartDayTradingBrain } from '../brains';
import type { Bar } from '../indicators';

// Re-export types from daily-simulator
export type {
    TradeRecord,
    DailySummary,
    SimulationProgress,
    SimulationResults,
    SimulationConfig,
} from './daily-simulator';

import type {
    TradeRecord,
    DailySummary,
    SimulationProgress,
    SimulationResults,
    SimulationConfig,
} from './daily-simulator';

/**
 * Default config for smart simulation
 */
const DEFAULT_SMART_CONFIG: SimulationConfig = {
    trainingMonths: 3,
    startDate: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    symbols: ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MSFT'],
    desks: ['day-trading'],
    positionSize: 1000,
    maxTradesPerDay: 1,       // Only trade high-conviction setups
    minConfidence: 0.55,      // Higher threshold for real signals
};

/**
 * Convert OHLCV bar to indicator Bar format
 */
function toBar(bar: OHLCVBar): Bar {
    return {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
    };
}

/**
 * Smart Daily Trade Simulator
 */
export class SmartDailySimulator {
    private config: SimulationConfig;
    private provider: PolygonTrainingProvider;
    private brain: SmartDayTradingBrain;

    // Results
    private trades: TradeRecord[] = [];
    private dailySummaries: DailySummary[] = [];
    private expertStats: Map<string, { trades: number; wins: number; pnl: number }> = new Map();

    constructor(config?: Partial<SimulationConfig>) {
        this.config = { ...DEFAULT_SMART_CONFIG, ...config };
        this.provider = new PolygonTrainingProvider();
        this.brain = new SmartDayTradingBrain();
    }

    /**
     * Get trading days between two dates
     */
    private getTradingDays(start: Date, end: Date): Date[] {
        const days: Date[] = [];
        const current = new Date(start);

        while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                days.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        return days;
    }

    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
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
     * Simulate a single trading day using SMART brain
     */
    private async simulateDay(
        date: Date,
        historicalData: Map<string, OHLCVBar[]>,
        nextDayData: Map<string, OHLCVBar[]>
    ): Promise<TradeRecord[]> {
        const dayTrades: TradeRecord[] = [];
        const dateStr = this.formatDate(date);

        for (const symbol of this.config.symbols) {
            const bars = historicalData.get(symbol) || [];
            const nextBars = nextDayData.get(symbol) || [];

            if (bars.length < 50 || nextBars.length === 0) continue;

            const todayBar = bars[bars.length - 1];
            const nextDayBar = nextBars[0];

            // Feed historical data to the smart brain
            this.brain.feedHistoricalData(symbol, bars.map(toBar));

            // Build context
            const context: MarketContext = {
                timestamp: todayBar.timestamp,
                marketOpen: true,
                preMarket: false,
                afterHours: false,
                marketRegime: this.inferRegime(bars),
            };

            try {
                // Scan for candidates
                const candidates = await this.brain.scanCandidates(context);
                const candidate = candidates.find(c => c.symbol === symbol);

                if (!candidate) continue;

                // Build features with REAL indicators
                const features = await this.brain.buildFeatures(candidate, context);

                // Get prediction
                const prediction = await this.brain.predict(candidate, features, context);

                // Only trade if confident and not neutral
                if (prediction.confidence >= this.config.minConfidence && prediction.direction !== 'neutral') {
                    // Calculate actual result
                    const actualReturn = (nextDayBar.close - todayBar.close) / todayBar.close;
                    const pnlPercent = prediction.direction === 'long'
                        ? actualReturn * 100
                        : -actualReturn * 100;
                    const pnlDollars = (pnlPercent / 100) * this.config.positionSize;

                    const wasCorrect = (prediction.direction === 'long' && actualReturn > 0) ||
                        (prediction.direction === 'short' && actualReturn < 0);

                    const result: 'win' | 'loss' | 'breakeven' =
                        pnlDollars > 5 ? 'win' : pnlDollars < -5 ? 'loss' : 'breakeven';

                    // Get primary expert (the one with highest confidence)
                    const primaryExpert = prediction.expertContributions
                        .filter(c => c.confidenceComponent > 0.5)
                        .sort((a, b) => b.confidenceComponent - a.confidenceComponent)[0];

                    const trade: TradeRecord = {
                        id: uuidv4(),
                        date: dateStr,
                        symbol,
                        desk: 'day-trading' as DeskType,
                        expertName: primaryExpert?.expertName || 'Combined',
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
                            ? `✅ ${prediction.direction.toUpperCase()} worked. ${symbol} ${actualReturn > 0 ? 'gained' : 'lost'} ${(Math.abs(actualReturn) * 100).toFixed(2)}%`
                            : `❌ ${prediction.direction.toUpperCase()} failed. ${symbol} ${actualReturn > 0 ? 'gained' : 'lost'} ${(Math.abs(actualReturn) * 100).toFixed(2)}%`,
                    };

                    dayTrades.push(trade);

                    // Update expert stats for ALL contributing experts
                    for (const contrib of prediction.expertContributions) {
                        if (contrib.confidenceComponent > 0.4) {
                            const stats = this.expertStats.get(contrib.expertName) || { trades: 0, wins: 0, pnl: 0 };
                            stats.trades++;
                            if (wasCorrect) stats.wins++;
                            stats.pnl += pnlDollars * contrib.confidenceComponent; // Weighted P&L
                            this.expertStats.set(contrib.expertName, stats);
                        }
                    }
                }
            } catch (error) {
                console.warn(`[SmartSim] Error for ${symbol} on ${dateStr}:`, error);
            }
        }

        // Clear brain data for next day
        this.brain.clearData();

        return dayTrades;
    }

    /**
     * Run full smart simulation
     */
    async runSimulation(
        onProgress?: (progress: SimulationProgress) => void,
        onDayComplete?: (date: string, trades: TradeRecord[]) => void
    ): Promise<SimulationResults> {
        console.log('[SmartSim] Starting SMART daily trade simulation...');
        console.log('[SmartSim] Using REAL technical indicators: VWAP, RSI, MACD, Support/Resistance');

        // Check API
        const available = await this.provider.isAvailable();
        if (!available) {
            throw new Error('Polygon API not available');
        }

        // Calculate simulation start (after training period)
        const trainingEndDate = new Date(this.config.startDate);
        trainingEndDate.setMonth(trainingEndDate.getMonth() + this.config.trainingMonths);

        console.log(`[SmartSim] Training data: ${this.formatDate(this.config.startDate)} to ${this.formatDate(trainingEndDate)}`);
        console.log(`[SmartSim] Simulation: ${this.formatDate(trainingEndDate)} to ${this.formatDate(this.config.endDate)}`);

        // Get all trading days
        const tradingDays = this.getTradingDays(trainingEndDate, this.config.endDate);
        console.log(`[SmartSim] Trading days to simulate: ${tradingDays.length}`);

        // Fetch all historical data upfront
        const allData: Map<string, OHLCVBar[]> = new Map();

        for (const symbol of this.config.symbols) {
            console.log(`[SmartSim] Fetching ${symbol}...`);
            const bars = await this.provider.getOHLCV(
                symbol,
                '1d',
                this.config.startDate,
                this.config.endDate
            );
            allData.set(symbol, bars);
            console.log(`[SmartSim] ${symbol}: ${bars.length} bars`);
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

            // Simulate this day with SMART brain
            const dayTrades = await this.simulateDay(currentDay, historicalData, nextDayData);

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
                const winRate = this.trades.length > 0 ? (totalWins / this.trades.length * 100).toFixed(1) : '0';
                console.log(`[SmartSim] Day ${i + 1}/${tradingDays.length - 1} | Trades: ${this.trades.length} | Win Rate: ${winRate}% | P&L: $${totalPnL.toFixed(2)}`);
            }

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

        console.log(`[SmartSim] Simulation complete!`);
        console.log(`[SmartSim] Days: ${results.totalDays} | Trades: ${results.totalTrades}`);
        console.log(`[SmartSim] Win Rate: ${(results.winRate * 100).toFixed(1)}% | P&L: $${results.totalPnL.toFixed(2)}`);

        // Log expert performance
        console.log(`[SmartSim] Expert Performance:`);
        Object.entries(expertPerformance)
            .sort((a, b) => b[1].winRate - a[1].winRate)
            .forEach(([name, stats]) => {
                console.log(`  ${name}: ${stats.trades} trades, ${(stats.winRate * 100).toFixed(1)}% win, $${stats.totalPnL.toFixed(2)}`);
            });

        return results;
    }

    getTrades(): TradeRecord[] {
        return [...this.trades];
    }

    clear(): void {
        this.trades = [];
        this.dailySummaries = [];
        this.expertStats.clear();
    }
}

// Singleton
let smartSimulatorInstance: SmartDailySimulator | null = null;

export function getSmartSimulator(config?: Partial<SimulationConfig>): SmartDailySimulator {
    if (!smartSimulatorInstance) {
        smartSimulatorInstance = new SmartDailySimulator(config);
    }
    return smartSimulatorInstance;
}

export function resetSmartSimulator(): void {
    smartSimulatorInstance = null;
}
