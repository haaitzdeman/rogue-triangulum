'use client';

/**
 * Strategy Backtester Page V1
 * 
 * Phase A: Daily bars only (swing horizons 3-10 days).
 * Runs strategies against historical data with anti-lookahead.
 */

import { useState, useCallback } from 'react';
import { PolygonTrainingProvider } from '@/lib/training/polygon-provider';
import { runDailyBacktest, type BacktestTrade, type BacktestMetrics } from '@/lib/backtest';
import { ALL_STRATEGIES } from '@/lib/strategies';
import type { Bar } from '@/lib/indicators';

export default function BacktesterPage() {
    // Config state
    const [symbol, setSymbol] = useState('AAPL');
    const [year, setYear] = useState(2024);
    const [holdingDays, setHoldingDays] = useState(7);
    const [targetR, setTargetR] = useState(2);
    const [minScore, _setMinScore] = useState(50);
    const [slippage, setSlippage] = useState(0);

    // Results state
    const [running, setRunning] = useState(false);
    const [trades, setTrades] = useState<BacktestTrade[]>([]);
    const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState('');
    const [selectedTrade, setSelectedTrade] = useState<BacktestTrade | null>(null);

    const runBacktest = useCallback(async () => {
        setRunning(true);
        setError(null);
        setTrades([]);
        setMetrics(null);
        setSelectedTrade(null);
        setProgress('Fetching daily data...');

        try {
            const provider = new PolygonTrainingProvider();

            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31);

            setProgress(`Fetching ${symbol} daily bars for ${year}...`);

            const ohlcvBars = await provider.getOHLCV(symbol, '1d', startDate, endDate);

            if (ohlcvBars.length < 100) {
                throw new Error(`Only ${ohlcvBars.length} bars found. Need at least 100 for backtest.`);
            }

            const bars: Bar[] = ohlcvBars.map(b => ({
                timestamp: b.timestamp,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
            }));

            setProgress(`Running backtest on ${bars.length} daily bars...`);

            const result = runDailyBacktest(bars, {
                symbol,
                strategies: ALL_STRATEGIES,
                minScore,
                minConfidence: 0.5,
                defaultHoldingDays: holdingDays,
                targetRMultiple: targetR,
                slippagePercent: slippage,
            });

            setTrades(result.trades);
            setMetrics(result.metrics);
            setProgress('Complete');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setRunning(false);
        }
    }, [symbol, year, holdingDays, targetR, minScore, slippage]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">📊 Strategy Backtester V1</h1>
            <p className="text-gray-400 mb-6">
                Daily bars only. Swing horizons (3-10 days). Anti-lookahead enforced.
            </p>

            {/* Config Panel */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-6 gap-4 mb-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Symbol</label>
                        <input
                            type="text"
                            value={symbol}
                            onChange={e => setSymbol(e.target.value.toUpperCase())}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Year</label>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        >
                            {[2020, 2021, 2022, 2023, 2024, 2025].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Hold Days</label>
                        <select
                            value={holdingDays}
                            onChange={e => setHoldingDays(Number(e.target.value))}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        >
                            {[3, 5, 7, 10].map(d => (
                                <option key={d} value={d}>{d} days</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Target R</label>
                        <select
                            value={targetR}
                            onChange={e => setTargetR(Number(e.target.value))}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        >
                            {[1.5, 2, 2.5, 3].map(r => (
                                <option key={r} value={r}>{r}R</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Slippage %</label>
                        <select
                            value={slippage}
                            onChange={e => setSlippage(Number(e.target.value))}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        >
                            <option value={0}>0% (Ideal)</option>
                            <option value={0.1}>0.1%</option>
                            <option value={0.25}>0.25%</option>
                            <option value={0.5}>0.5% (Conservative)</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={runBacktest}
                            disabled={running}
                            className={`w-full px-4 py-2 rounded font-bold ${running
                                ? 'bg-yellow-600 text-black cursor-wait'
                                : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                        >
                            {running ? '⏳ Running...' : '▶️ Run Backtest'}
                        </button>
                    </div>
                </div>

                <div className="text-xs text-gray-500">
                    Strategies: {ALL_STRATEGIES.map(s => s.name).join(', ')} |
                    Min Score: {minScore} |
                    Entry: D+1 Open |
                    Exit: Stop/Target/Time
                </div>

                {progress && !error && (
                    <div className="mt-4 text-sm text-yellow-400">{progress}</div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300">
                        ❌ {error}
                    </div>
                )}
            </div>

            {/* Results */}
            {metrics && (
                <>
                    {/* Core Metrics */}
                    <div className="bg-gray-800 rounded-lg p-4 mb-6">
                        <h2 className="font-bold text-white mb-4">📈 Results Summary</h2>

                        <div className="grid grid-cols-8 gap-3 mb-6">
                            <MetricCard label="Trades" value={metrics.totalTrades} />
                            <MetricCard
                                label="Win Rate"
                                value={`${(metrics.winRate * 100).toFixed(1)}%`}
                                color={metrics.winRate >= 0.5 ? 'green' : 'yellow'}
                            />
                            <MetricCard
                                label="Total Return"
                                value={`${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`}
                                color={metrics.totalReturn >= 0 ? 'green' : 'red'}
                            />
                            <MetricCard
                                label="Avg R"
                                value={`${metrics.avgR >= 0 ? '+' : ''}${metrics.avgR.toFixed(2)}R`}
                                color={metrics.avgR >= 0 ? 'green' : 'red'}
                            />
                            <MetricCard
                                label="Profit Factor"
                                value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
                                color={metrics.profitFactor >= 1 ? 'green' : 'red'}
                            />
                            <MetricCard
                                label="Max DD"
                                value={`${metrics.maxDrawdownPercent.toFixed(1)}%`}
                                color="orange"
                            />
                            <MetricCard label="Avg Hold" value={`${metrics.avgHoldingDays.toFixed(1)}d`} />
                            <MetricCard label="Max Losses" value={metrics.maxConsecutiveLosses} color="orange" />
                        </div>

                        {/* Win/Loss Stats */}
                        <div className="grid grid-cols-4 gap-3 text-sm">
                            <div className="bg-gray-900 rounded p-2">
                                <span className="text-gray-500">Avg Win:</span>
                                <span className="text-green-400 ml-2">+{metrics.avgWinPercent.toFixed(2)}% ({metrics.avgWinR.toFixed(2)}R)</span>
                            </div>
                            <div className="bg-gray-900 rounded p-2">
                                <span className="text-gray-500">Avg Loss:</span>
                                <span className="text-red-400 ml-2">{metrics.avgLossPercent.toFixed(2)}% ({metrics.avgLossR.toFixed(2)}R)</span>
                            </div>
                            <div className="bg-gray-900 rounded p-2">
                                <span className="text-gray-500">Wins:</span>
                                <span className="text-green-400 ml-2">{metrics.wins}</span>
                            </div>
                            <div className="bg-gray-900 rounded p-2">
                                <span className="text-gray-500">Losses:</span>
                                <span className="text-red-400 ml-2">{metrics.losses}</span>
                            </div>
                        </div>
                    </div>

                    {/* By Strategy */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="font-bold text-white mb-3">By Strategy</h3>
                            <div className="space-y-2">
                                {Object.entries(metrics.byStrategy).map(([name, stats]) => (
                                    <div key={name} className="flex justify-between items-center bg-gray-700 rounded p-2">
                                        <span className="font-medium text-white">{name}</span>
                                        <div className="text-sm">
                                            <span className="text-gray-400">{stats.trades}t</span>
                                            <span className={`ml-2 ${stats.winRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {(stats.winRate * 100).toFixed(0)}%
                                            </span>
                                            <span className={`ml-2 ${stats.avgR >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {stats.avgR >= 0 ? '+' : ''}{stats.avgR.toFixed(2)}R
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* By Year */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="font-bold text-white mb-3">By Year</h3>
                            <div className="space-y-2">
                                {Object.entries(metrics.byYear)
                                    .sort(([a], [b]) => Number(a) - Number(b))
                                    .map(([year, stats]) => (
                                        <div key={year} className="flex justify-between items-center bg-gray-700 rounded p-2">
                                            <span className="font-medium text-white">{year}</span>
                                            <div className="text-sm">
                                                <span className="text-gray-400">{stats.trades}t</span>
                                                <span className={`ml-2 ${stats.winRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {(stats.winRate * 100).toFixed(0)}%
                                                </span>
                                                <span className={`ml-2 ${stats.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>

                    {/* Equity Curve */}
                    {metrics.equityCurve.length > 0 && (
                        <div className="bg-gray-800 rounded-lg p-4 mb-6">
                            <h3 className="font-bold text-white mb-3">📈 Equity Curve</h3>
                            <div className="h-48 flex items-end gap-px">
                                {metrics.equityCurve
                                    .filter((_, i) => i % Math.ceil(metrics.equityCurve.length / 100) === 0)
                                    .map((point, i) => {
                                        const minBal = Math.min(...metrics.equityCurve.map(p => p.balance));
                                        const maxBal = Math.max(...metrics.equityCurve.map(p => p.balance));
                                        const range = maxBal - minBal || 1;
                                        const height = ((point.balance - minBal) / range) * 100;
                                        const isUp = i > 0 && point.balance >= metrics.equityCurve[Math.max(0, i - 1)]?.balance;
                                        return (
                                            <div
                                                key={i}
                                                className={`flex-1 ${isUp ? 'bg-green-500' : 'bg-red-500'} opacity-80`}
                                                style={{ height: `${Math.max(5, height)}%` }}
                                                title={`${point.date}: $${point.balance.toFixed(0)}`}
                                            />
                                        );
                                    })}
                            </div>
                            <div className="flex justify-between mt-2 text-xs text-gray-500">
                                <span>{metrics.equityCurve[0]?.date}</span>
                                <span>{metrics.equityCurve[metrics.equityCurve.length - 1]?.date}</span>
                            </div>
                        </div>
                    )}

                    {/* Trade List */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <h2 className="font-bold text-white mb-4">📋 Trades ({trades.length})</h2>
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-800">
                                    <tr>
                                        <th className="text-left p-2">Entry</th>
                                        <th className="text-left p-2">Strategy</th>
                                        <th className="text-left p-2">Dir</th>
                                        <th className="text-right p-2">Entry $</th>
                                        <th className="text-right p-2">Exit $</th>
                                        <th className="text-right p-2">R</th>
                                        <th className="text-right p-2">P&L</th>
                                        <th className="text-left p-2">Exit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trades.map(trade => (
                                        <tr
                                            key={trade.id}
                                            className={`border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer ${selectedTrade?.id === trade.id ? 'bg-blue-900/30' : ''
                                                }`}
                                            onClick={() => setSelectedTrade(trade)}
                                        >
                                            <td className="p-2 font-mono text-xs">{trade.entryDate}</td>
                                            <td className="p-2">{trade.strategy}</td>
                                            <td className={`p-2 font-bold ${trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                                {trade.direction.toUpperCase()}
                                            </td>
                                            <td className="p-2 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                                            <td className="p-2 text-right font-mono">${trade.exitPrice.toFixed(2)}</td>
                                            <td className={`p-2 text-right font-mono font-bold ${trade.rMultiple >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
                                            </td>
                                            <td className={`p-2 text-right font-mono ${trade.won ? 'text-green-400' : 'text-red-400'}`}>
                                                {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                                            </td>
                                            <td className="p-2">
                                                {trade.exitReason === 'stop' && '🛑'}
                                                {trade.exitReason === 'target' && '🎯'}
                                                {trade.exitReason === 'time' && '⏰'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Selected Trade Detail */}
                    {selectedTrade && (
                        <div className="bg-gray-800 rounded-lg p-4 mt-6">
                            <h3 className="font-bold text-white mb-3">
                                🔍 Trade #{selectedTrade.id} - {selectedTrade.symbol} {selectedTrade.direction.toUpperCase()}
                            </h3>
                            <div className="grid grid-cols-4 gap-4 mb-4">
                                <div className="bg-gray-700 rounded p-3">
                                    <div className="text-gray-400 text-xs">Entry</div>
                                    <div className="text-white">{selectedTrade.entryDate} @ ${selectedTrade.entryPrice.toFixed(2)}</div>
                                </div>
                                <div className="bg-gray-700 rounded p-3">
                                    <div className="text-gray-400 text-xs">Stop Loss</div>
                                    <div className="text-red-400">${selectedTrade.stopLoss.toFixed(2)}</div>
                                </div>
                                <div className="bg-gray-700 rounded p-3">
                                    <div className="text-gray-400 text-xs">Target ({selectedTrade.targetR}R)</div>
                                    <div className="text-green-400">${selectedTrade.targetPrice.toFixed(2)}</div>
                                </div>
                                <div className="bg-gray-700 rounded p-3">
                                    <div className="text-gray-400 text-xs">Exit ({selectedTrade.exitReason})</div>
                                    <div className="text-white">{selectedTrade.exitDate} @ ${selectedTrade.exitPrice.toFixed(2)}</div>
                                </div>
                            </div>
                            <div className="bg-gray-900 rounded p-3">
                                <div className="text-gray-400 text-xs mb-1">Reasons (Score: {selectedTrade.score})</div>
                                <ul className="text-sm text-white space-y-1">
                                    {selectedTrade.reasons.map((r, i) => (
                                        <li key={i}>• {r}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Empty State */}
            {!running && !metrics && trades.length === 0 && (
                <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                    <p className="text-4xl mb-4">📊</p>
                    <p className="text-lg mb-2">Strategy Backtester V1</p>
                    <p className="text-sm">Daily bars | Swing horizons (3-10d) | Anti-lookahead</p>
                    <p className="text-xs mt-4 text-yellow-500/70">
                        ⚠️ No AI/ML - Rule-based strategies only
                    </p>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, color = 'white' }: { label: string; value: string | number; color?: string }) {
    const colorClass = {
        white: 'text-white',
        green: 'text-green-400',
        red: 'text-red-400',
        yellow: 'text-yellow-400',
        orange: 'text-orange-400',
    }[color] || 'text-white';

    return (
        <div className="bg-gray-700 rounded p-2 text-center">
            <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
        </div>
    );
}
