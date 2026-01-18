'use client';

/**
 * Smart Daily Trade Simulation Page
 * 
 * Uses REAL technical indicators (VWAP, RSI, MACD, Support/Resistance).
 * Day-by-day simulation with proper expert attribution.
 */

import { useState, useCallback, useRef } from 'react';
import {
    getSmartSimulator,
    resetSmartSimulator,
    type SimulationProgress,
    type SimulationResults,
    type TradeRecord,
} from '@/lib/training/smart-simulator';

function TradeRow({ trade }: { trade: TradeRecord }) {
    const pnlColor = (trade.pnlDollars || 0) > 0 ? 'text-green-400' : 'text-red-400';
    const resultIcon = trade.result === 'win' ? '✅' : trade.result === 'loss' ? '❌' : '➖';

    return (
        <tr className="border-t border-gray-700 text-xs">
            <td className="py-1">{trade.date}</td>
            <td className="py-1 font-bold">{trade.symbol}</td>
            <td className={`py-1 ${trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {trade.direction.toUpperCase()}
            </td>
            <td className="py-1">${trade.entryPrice.toFixed(2)}</td>
            <td className="py-1">${trade.exitPrice?.toFixed(2) || '-'}</td>
            <td className={`py-1 ${pnlColor}`}>
                {(trade.pnlDollars || 0) >= 0 ? '+' : ''}${(trade.pnlDollars || 0).toFixed(2)}
            </td>
            <td className="py-1">{resultIcon}</td>
            <td className="py-1 text-gray-400">{trade.expertName}</td>
        </tr>
    );
}

export default function DailySimulationPage() {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<SimulationProgress | null>(null);
    const [results, setResults] = useState<SimulationResults | null>(null);
    const [recentTrades, setRecentTrades] = useState<TradeRecord[]>([]);
    const [trainingMonths, setTrainingMonths] = useState(3);
    const [simulationMonths, setSimulationMonths] = useState(20);
    const tradesRef = useRef<TradeRecord[]>([]);

    const startSimulation = useCallback(async () => {
        setRunning(true);
        setResults(null);
        setRecentTrades([]);
        tradesRef.current = [];

        resetSmartSimulator();

        const simulator = getSmartSimulator({
            trainingMonths,
            startDate: new Date(Date.now() - (trainingMonths + simulationMonths) * 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            minConfidence: 0.55, // Higher threshold for real indicators
        });

        try {
            const result = await simulator.runSimulation(
                (prog) => {
                    setProgress({ ...prog });
                },
                (date, trades) => {
                    tradesRef.current = [...tradesRef.current, ...trades];
                    // Keep last 50 trades for display
                    setRecentTrades(tradesRef.current.slice(-50));
                }
            );

            setResults(result);
        } catch (error) {
            console.error('Simulation failed:', error);
        } finally {
            setRunning(false);
        }
    }, [trainingMonths, simulationMonths]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">🧠 Smart Agent Simulation</h1>
            <p className="text-gray-400 mb-2">
                Day-by-day trading with <span className="text-green-400 font-semibold">REAL technical indicators</span>
            </p>
            <p className="text-xs text-gray-500 mb-6">
                Uses: VWAP, RSI, MACD, Support/Resistance, Volume Analysis, Trend Detection
            </p>

            {/* Config */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <h2 className="font-bold text-white mb-4">Configuration</h2>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Training Period (months) - Fed first, no trades
                        </label>
                        <input
                            type="number"
                            value={trainingMonths}
                            onChange={e => setTrainingMonths(Number(e.target.value))}
                            min={1}
                            max={6}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Simulation Period (months) - Day-by-day trading
                        </label>
                        <input
                            type="number"
                            value={simulationMonths}
                            onChange={e => setSimulationMonths(Number(e.target.value))}
                            min={3}
                            max={24}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={startSimulation}
                            disabled={running}
                            className={`w-full px-6 py-2 rounded font-bold ${running
                                ? 'bg-gray-600 text-gray-400 cursor-wait'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            {running ? '🔄 Simulating...' : '▶️ Start Day-by-Day Simulation'}
                        </button>
                    </div>
                </div>

                {/* Progress */}
                {running && progress && (
                    <div className="mt-4 p-4 bg-gray-700 rounded">
                        <div className="flex justify-between text-sm text-gray-300 mb-2">
                            <span>Day {progress.daysCompleted} of {progress.totalDays}</span>
                            <span>{progress.currentDate}</span>
                            <span>{progress.totalTrades} trades</span>
                            <span>Win Rate: {(progress.winRate * 100).toFixed(1)}%</span>
                            <span className={progress.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                                P&L: ${progress.totalPnL.toFixed(2)}
                            </span>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-3">
                            <div
                                className="bg-blue-500 h-3 rounded-full transition-all"
                                style={{ width: `${(progress.daysCompleted / progress.totalDays) * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Final Results */}
            {results && (
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h2 className="font-bold text-white mb-4">📈 Final Results</h2>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-5 gap-4 mb-6">
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">{results.totalDays}</div>
                            <div className="text-sm text-gray-400">Trading Days</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">{results.totalTrades}</div>
                            <div className="text-sm text-gray-400">Total Trades</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${results.winRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                                {(results.winRate * 100).toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-400">Win Rate</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-green-400">{results.totalWins}</div>
                            <div className="text-sm text-gray-400">Wins</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${results.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ${results.totalPnL.toFixed(2)}
                            </div>
                            <div className="text-sm text-gray-400">Total P&L</div>
                        </div>
                    </div>

                    {/* Expert Performance */}
                    <h3 className="font-bold text-white mb-2">Expert Performance</h3>
                    <div className="grid grid-cols-4 gap-3 mb-6">
                        {Object.entries(results.expertPerformance)
                            .sort((a, b) => b[1].winRate - a[1].winRate)
                            .map(([name, stats]) => (
                                <div key={name} className="bg-gray-700 rounded p-3">
                                    <div className="font-bold text-white">{name}</div>
                                    <div className="text-sm text-gray-400">
                                        {stats.trades} trades | {(stats.winRate * 100).toFixed(0)}% win
                                    </div>
                                    <div className={`text-sm ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        ${stats.totalPnL.toFixed(2)}
                                    </div>
                                </div>
                            ))}
                    </div>

                    {/* Symbol Performance */}
                    <h3 className="font-bold text-white mb-2">Symbol Performance</h3>
                    <div className="grid grid-cols-5 gap-3">
                        {Object.entries(results.symbolPerformance).map(([symbol, stats]) => (
                            <div key={symbol} className="bg-gray-700 rounded p-3">
                                <div className="font-bold text-white">{symbol}</div>
                                <div className="text-sm text-gray-400">
                                    {stats.trades} trades | {stats.wins} wins
                                </div>
                                <div className={`text-sm ${stats.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${stats.pnl.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Trade Log */}
            {recentTrades.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="font-bold text-white mb-4">
                        📋 Trade Log {results ? `(${results.totalTrades} total, showing last 50)` : '(Live)'}
                    </h2>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-white">
                            <thead className="sticky top-0 bg-gray-800">
                                <tr className="text-gray-400 text-left text-xs">
                                    <th className="pb-2">Date</th>
                                    <th className="pb-2">Symbol</th>
                                    <th className="pb-2">Direction</th>
                                    <th className="pb-2">Entry</th>
                                    <th className="pb-2">Exit</th>
                                    <th className="pb-2">P&L</th>
                                    <th className="pb-2">Result</th>
                                    <th className="pb-2">Expert</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTrades.slice().reverse().map(trade => (
                                    <TradeRow key={trade.id} trade={trade} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg text-sm text-blue-300/80">
                <strong>How It Works:</strong> First {trainingMonths} months are used as training data (no trades).
                Then the system simulates {simulationMonths} months of day-by-day trading.
                Each day, every expert analyzes the market and places trades.
                Results are compared to actual next-day prices.
            </div>
        </div>
    );
}
