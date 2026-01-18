'use client';

/**
 * Sequential 5-Year Training
 * 
 * Day-by-day training where the AI processes real market data in sequence.
 * Each day builds on the previous - just like real trading.
 * 
 * NO REPEATING DATA. NO CHEATING. SINGLE PASS ONLY.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    getMeticulousEngine,
    resetMeticulousEngine,
    type DailyRecord,
    type LearningSession,
    type TrainingState,
    type AgentPortfolio,
    type TradingAgent,
    type BrainState,
    type YearlyStats,
} from '@/lib/training/meticulous-engine';

const BRAIN_STORAGE_KEY = 'meticulous-brain-state';

const STORAGE_KEY = 'meticulous-training-state';

function DayCard({ record }: { record: DailyRecord }) {
    const [expanded, setExpanded] = useState(false);
    const pnlColor = record.pnl >= 0 ? 'text-green-400' : 'text-red-400';

    return (
        <div className="bg-gray-700 rounded p-3 mb-2">
            <div
                className="flex justify-between items-center cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                        Day {record.day}
                    </span>
                    <span className="text-white font-mono">{record.date}</span>
                    <span className="text-xs text-gray-500">
                        ({record.tradesPlaced} trades)
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">
                        {record.wins}W / {record.losses}L
                    </span>
                    <span className={`font-mono font-bold ${pnlColor}`}>
                        {record.pnl >= 0 ? '+' : ''}${record.pnl.toFixed(2)}
                    </span>
                    <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
                </div>
            </div>

            {expanded && record.trades.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-600 space-y-3">
                    {record.trades.map((trade, idx) => (
                        <div key={trade.id} className="p-3 bg-gray-800 rounded-lg border-l-4 border-l-blue-500">
                            {/* Trade Header */}
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-white">{trade.symbol}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${trade.direction === 'long' ? 'bg-green-600' : 'bg-red-600'
                                        }`}>
                                        {trade.direction.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        #{idx + 1}
                                    </span>
                                </div>
                                <div className={`text-lg font-bold ${trade.wasCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                    {trade.wasCorrect ? '✅' : '❌'}
                                    {trade.pnlDollars >= 0 ? '+' : ''}${trade.pnlDollars.toFixed(2)}
                                </div>
                            </div>

                            {/* Trade Details Grid */}
                            <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                                <div className="bg-gray-900 p-2 rounded">
                                    <div className="text-gray-500">Position</div>
                                    <div className="text-white font-mono">{trade.positionSize} shares</div>
                                    <div className="text-gray-400">${trade.positionValue?.toFixed(2) || '---'}</div>
                                </div>
                                <div className="bg-gray-900 p-2 rounded">
                                    <div className="text-gray-500">Entry</div>
                                    <div className="text-white font-mono">${trade.entryPrice.toFixed(2)}</div>
                                    <div className="text-gray-400">{trade.entryTime || '---'}</div>
                                </div>
                                <div className="bg-gray-900 p-2 rounded">
                                    <div className="text-gray-500">Exit</div>
                                    <div className="text-white font-mono">${trade.exitPrice.toFixed(2)}</div>
                                    <div className="text-gray-400">
                                        {trade.exitTime || '---'}
                                        {trade.hitStopLoss && <span className="text-red-400 ml-1">🛑SL</span>}
                                        {trade.hitTakeProfit && <span className="text-green-400 ml-1">🎯TP</span>}
                                    </div>
                                </div>
                                <div className="bg-gray-900 p-2 rounded">
                                    <div className="text-gray-500">Risk</div>
                                    <div className="text-white font-mono">{trade.riskPercent?.toFixed(1) || '---'}%</div>
                                    <div className="text-gray-400">${trade.riskAmount?.toFixed(2) || '---'}</div>
                                </div>
                            </div>

                            {/* Stop/TP Levels */}
                            <div className="flex gap-4 text-xs text-gray-400 mb-2">
                                <span>Stop: <span className="text-red-400">${trade.stopLoss?.toFixed(2) || '---'}</span></span>
                                <span>Target: <span className="text-green-400">${trade.takeProfit?.toFixed(2) || '---'}</span></span>
                                <span>Move: <span className={trade.actualMove >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    {trade.actualMove >= 0 ? '+' : ''}{trade.actualMove.toFixed(2)}%
                                </span></span>
                                {trade.tradeDuration && (
                                    <span>Duration: <span className="text-blue-400">{trade.tradeDuration} min</span></span>
                                )}
                            </div>

                            {/* Expert Signals */}
                            <div className="flex flex-wrap gap-1 mt-2">
                                {trade.expertSignals.map(signal => (
                                    <span
                                        key={signal.name}
                                        className={`text-xs px-2 py-0.5 rounded ${signal.direction === 'long' ? 'bg-green-900/50 text-green-300' :
                                            signal.direction === 'short' ? 'bg-red-900/50 text-red-300' :
                                                'bg-gray-600 text-gray-300'
                                            }`}
                                    >
                                        {signal.name}: {signal.direction} ({(signal.strength * 100).toFixed(0)}%)
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {expanded && record.trades.length === 0 && (
                <div className="mt-3 pt-3 border-t border-gray-600 text-gray-500 text-sm">
                    No trades - insufficient expert agreement
                </div>
            )}
        </div>
    );
}

/**
 * Proper Calendar Grid - Shows all days like a real calendar
 */
function TrainingCalendar({
    records,
    currentDate,
    isRunning
}: {
    records: DailyRecord[];
    currentDate?: string;
    isRunning: boolean;
}) {
    // Calculate performance trend
    const totalPnL = records.reduce((s, r) => s + r.pnl, 0);
    const totalWins = records.reduce((s, r) => s + r.wins, 0);
    const totalTrades = records.reduce((s, r) => s + r.tradesPlaced, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    // Create a map of trained dates for quick lookup
    const trainedDates = new Map<string, DailyRecord>();
    records.forEach(record => {
        trainedDates.set(record.date, record);
    });

    // Generate months to display (last 6 months of available data or current year)
    const getMonthsToShow = () => {
        const months: Date[] = [];
        const now = new Date();

        if (records.length > 0) {
            // Show months that have training data
            const dates = records.map(r => r.date).sort();
            const startMonth = new Date(dates[0]);
            const endMonth = new Date(dates[dates.length - 1]);

            const current = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
            while (current <= endMonth) {
                months.push(new Date(current));
                current.setMonth(current.getMonth() + 1);
            }
        } else {
            // Show current month and next 2 months
            for (let i = 0; i < 3; i++) {
                months.push(new Date(now.getFullYear(), now.getMonth() + i, 1));
            }
        }
        return months;
    };

    const months = getMonthsToShow();
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    // Generate calendar grid for a month
    const renderMonth = (monthDate: Date) => {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days: (number | null)[] = [];

        // Add empty cells for days before the first day
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        // Add all days in the month
        for (let d = 1; d <= daysInMonth; d++) {
            days.push(d);
        }

        return (
            <div key={`${year}-${month}`} className="bg-gray-900 p-4 rounded-lg">
                {/* Month Header */}
                <div className="font-bold text-white text-center mb-3">
                    {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekdays.map(day => (
                        <div key={day} className="text-center text-xs text-gray-500 font-bold">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                    {days.map((day, idx) => {
                        if (day === null) {
                            return <div key={`empty-${idx}`} className="w-8 h-8"></div>;
                        }

                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const record = trainedDates.get(dateStr);
                        const isCurrent = dateStr === currentDate;
                        const isWeekend = (firstDay + day - 1) % 7 === 0 || (firstDay + day - 1) % 7 === 6;

                        let bgColor = 'bg-gray-700'; // Default: untrained weekday
                        let textColor = 'text-gray-400';

                        if (isWeekend) {
                            bgColor = 'bg-gray-800';
                            textColor = 'text-gray-600';
                        }

                        if (record) {
                            if (record.tradesPlaced === 0) {
                                bgColor = 'bg-gray-600';
                                textColor = 'text-white';
                            } else if (record.pnl >= 0) {
                                bgColor = 'bg-green-600';
                                textColor = 'text-white';
                            } else {
                                bgColor = 'bg-red-600';
                                textColor = 'text-white';
                            }
                        }

                        if (isCurrent) {
                            bgColor = 'bg-yellow-500 ring-2 ring-yellow-300';
                            textColor = 'text-black font-bold';
                        }

                        return (
                            <div
                                key={dateStr}
                                className={`w-8 h-8 ${bgColor} ${textColor} rounded flex items-center justify-center text-xs cursor-default`}
                                title={record
                                    ? `${dateStr}\n${record.tradesPlaced} trades\nP&L: $${record.pnl.toFixed(2)}`
                                    : dateStr
                                }
                            >
                                {day}
                            </div>
                        );
                    })}
                </div>

                {/* Month Summary */}
                {records.length > 0 && (
                    <div className="text-xs text-gray-400 mt-2 text-center">
                        {records.filter(r => r.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length} days trained
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
            {/* Header with Status */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-white text-lg">📅 Training Calendar</h2>
                <div className="flex items-center gap-4">
                    {isRunning && currentDate && (
                        <span className="text-yellow-400 text-sm animate-pulse">
                            🔄 Training: {currentDate}
                        </span>
                    )}
                </div>
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-900 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-white">{records.length}</div>
                    <div className="text-xs text-gray-400">Days Trained</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                    <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${totalPnL.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-400">Total P&L</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                    <div className={`text-2xl font-bold ${winRate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {winRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">Win Rate</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-white">{totalTrades}</div>
                    <div className="text-xs text-gray-400">Total Trades</div>
                </div>
            </div>

            {/* Legend */}
            <div className="text-xs text-gray-400 mb-4 flex flex-wrap gap-3">
                <span><span className="inline-block w-3 h-3 bg-gray-700 rounded mr-1"></span> Available</span>
                <span><span className="inline-block w-3 h-3 bg-green-600 rounded mr-1"></span> Profit</span>
                <span><span className="inline-block w-3 h-3 bg-red-600 rounded mr-1"></span> Loss</span>
                <span><span className="inline-block w-3 h-3 bg-gray-600 rounded mr-1"></span> No trades</span>
                <span><span className="inline-block w-3 h-3 bg-yellow-500 rounded mr-1"></span> Current</span>
                <span><span className="inline-block w-3 h-3 bg-gray-800 rounded mr-1"></span> Weekend</span>
            </div>

            {/* Calendar Grid - Multiple Months */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
                {months.map(month => renderMonth(month))}
            </div>
        </div>
    );
}

/**
 * Agent Team Panel - Shows each agent's separate portfolio performance
 */
function AgentTeamPanel({ trades }: { trades: { agent: TradingAgent; pnlDollars: number; wasCorrect: boolean }[] }) {
    const agentNames: Record<TradingAgent, { name: string; emoji: string; description: string }> = {
        'day-trading': { name: 'Day Trader', emoji: '⚡', description: 'Intraday, 1-min bars' },
        'swing': { name: 'Swing Trader', emoji: '🌊', description: 'Multi-day holds' },
        'options': { name: 'Options Trader', emoji: '🎯', description: 'Derivatives, hedging' },
        'investing': { name: 'Investor', emoji: '📈', description: 'Long-term growth' },
    };

    const agentStats = (['day-trading', 'swing', 'options', 'investing'] as TradingAgent[]).map(agent => {
        const agentTrades = trades.filter(t => t.agent === agent);
        const wins = agentTrades.filter(t => t.wasCorrect).length;
        const totalPnL = agentTrades.reduce((s, t) => s + t.pnlDollars, 0);
        const winRate = agentTrades.length > 0 ? (wins / agentTrades.length) * 100 : 0;

        return {
            agent,
            ...agentNames[agent],
            trades: agentTrades.length,
            wins,
            losses: agentTrades.length - wins,
            totalPnL,
            winRate,
        };
    });

    return (
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h2 className="font-bold text-white text-lg mb-4">🤖 Trading Team Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {agentStats.map(agent => (
                    <div
                        key={agent.agent}
                        className={`bg-gray-900 rounded-lg p-4 border-l-4 ${agent.trades === 0 ? 'border-gray-600' :
                            agent.totalPnL >= 0 ? 'border-green-500' : 'border-red-500'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">{agent.emoji}</span>
                            <div>
                                <div className="font-bold text-white">{agent.name}</div>
                                <div className="text-xs text-gray-500">{agent.description}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-gray-800 p-2 rounded">
                                <div className={`font-bold ${agent.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${agent.totalPnL.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-500">P&L</div>
                            </div>
                            <div className="bg-gray-800 p-2 rounded">
                                <div className={`font-bold ${agent.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {agent.winRate.toFixed(0)}%
                                </div>
                                <div className="text-xs text-gray-500">Win Rate</div>
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-400">
                            {agent.trades} trades | {agent.wins}W / {agent.losses}L
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function MeticulousLearningPage() {
    const [running, setRunning] = useState(false);
    const [session, setSession] = useState<LearningSession | null>(null);
    const [records, setRecords] = useState<DailyRecord[]>([]);
    const [progress, setProgress] = useState({ day: 0, total: 0, winRate: 0, pnl: 0 });
    const [trainingMonths, setTrainingMonths] = useState(3);
    const [simulationMonths, setSimulationMonths] = useState(48);
    const [tradingMode, setTradingMode] = useState<'intraday' | 'swing'>('intraday');
    const [startingCapital, setStartingCapital] = useState(800); // Default $800 per agent
    const [currentDate, setCurrentDate] = useState<string>('');
    const [savedState, setSavedState] = useState<TrainingState | null>(null);
    const recordsRef = useRef<DailyRecord[]>([]);

    // Load saved state on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const state = JSON.parse(saved) as TrainingState;
                setSavedState(state);
                // Auto-populate records from saved state
                setRecords(state.dailyRecords);
                recordsRef.current = state.dailyRecords;
                if (state.lastTrainedDate) {
                    setCurrentDate(state.lastTrainedDate);
                }
                console.log('📂 Found saved training state:', state.lastTrainedDate);
            }
        } catch (e) {
            console.error('Failed to load saved state:', e);
        }
    }, []);

    // Save training state
    const saveTrainingState = useCallback(() => {
        const engine = getMeticulousEngine();
        const state = engine.saveState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSavedState(state);
        console.log('💾 Training state saved!');
        alert(`Training saved! ${state.currentDayIndex} days at ${state.lastTrainedDate}`);
    }, []);

    // Clear saved state
    const clearSavedState = useCallback(() => {
        if (confirm('Clear all saved training progress? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY);
            setSavedState(null);
            setRecords([]);
            recordsRef.current = [];
            resetMeticulousEngine();
            console.log('🗑️ Training state cleared');
        }
    }, []);

    const startLearning = useCallback(async () => {
        setRunning(true);
        setSession(null);
        setRecords([]);
        recordsRef.current = [];

        // Reset and create engine with configured starting capital
        resetMeticulousEngine();
        const engine = getMeticulousEngine({ startingCapital });

        console.log(`🚀 Starting training with $${startingCapital} per agent`);

        try {
            const result = await engine.learn(
                trainingMonths,
                simulationMonths,
                (record) => {
                    recordsRef.current = [...recordsRef.current, record];
                    setRecords([...recordsRef.current]);
                    setCurrentDate(record.date); // Track current position
                },
                (day, total, winRate, pnl) => {
                    setProgress({ day, total, winRate, pnl });
                }
            );

            setSession(result);
        } catch (error) {
            console.error('Learning failed:', error);
        } finally {
            setRunning(false);
        }
    }, [trainingMonths, simulationMonths]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">🧠 Sequential 5-Year Training</h1>
            <p className="text-gray-400 mb-2">
                Each day is processed in sequence - just like real trading. No skipping, no repeating.
            </p>
            <p className="text-xs text-yellow-500/80 mb-6">
                ⚡ SINGLE PASS THROUGH HISTORY. NO CHEATING. AGENTS LEARN AS THEY GO.
            </p>

            {/* Config */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <h2 className="font-bold text-white mb-4">Configuration</h2>
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Training Base (months)
                        </label>
                        <input
                            type="number"
                            value={trainingMonths}
                            onChange={e => setTrainingMonths(Number(e.target.value))}
                            min={1}
                            max={6}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Sequential Trading Period (months)
                        </label>
                        <input
                            type="number"
                            value={simulationMonths}
                            onChange={e => setSimulationMonths(Number(e.target.value))}
                            min={3}
                            max={60}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Trading Mode
                        </label>
                        <select
                            value={tradingMode}
                            onChange={e => setTradingMode(e.target.value as 'intraday' | 'swing')}
                            disabled={running}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        >
                            <option value="intraday">Intraday (1-min bars)</option>
                            <option value="swing">Swing (Daily bars)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Starting Capital (per agent)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-400">$</span>
                            <input
                                type="number"
                                value={startingCapital}
                                onChange={e => setStartingCapital(Number(e.target.value))}
                                min={100}
                                max={10000}
                                step={100}
                                disabled={running}
                                className="w-full pl-7 pr-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                            />
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={startLearning}
                            disabled={running}
                            className={`flex-1 px-4 py-2 rounded font-bold ${running
                                ? 'bg-yellow-600 text-black cursor-wait'
                                : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                        >
                            {running ? '🧠 Learning...' : '▶️ Start'}
                        </button>
                        <button
                            onClick={saveTrainingState}
                            disabled={running || records.length === 0}
                            className="px-4 py-2 rounded font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            💾 Save
                        </button>
                        <button
                            onClick={clearSavedState}
                            disabled={running}
                            className="px-4 py-2 rounded font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                            🗑️ Clear
                        </button>
                        <button
                            onClick={() => {
                                const engine = getMeticulousEngine();
                                const brain = engine.exportBrain();
                                localStorage.setItem(BRAIN_STORAGE_KEY, JSON.stringify(brain));
                                alert(`🧠 Brain saved!\n\nExpert weights: ${Object.keys(brain.expertWeights).length}\nPatterns to avoid: ${brain.learnedPatterns.avoid.length}\nPatterns to follow: ${brain.learnedPatterns.follow.length}`);
                            }}
                            disabled={running || records.length === 0}
                            className="px-4 py-2 rounded font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                            🧠 Save Brain
                        </button>
                        <button
                            onClick={() => {
                                const savedBrain = localStorage.getItem(BRAIN_STORAGE_KEY);
                                if (!savedBrain) {
                                    alert('No saved brain found!');
                                    return;
                                }
                                if (confirm('Load brain? This will apply learned weights but reset trade history.')) {
                                    const brain = JSON.parse(savedBrain) as BrainState;
                                    const engine = getMeticulousEngine();
                                    engine.loadBrain(brain);
                                    setRecords([]);
                                    alert(`🧠 Brain loaded!\n\nVersion: ${brain.version}\nExported: ${new Date(brain.exportDate).toLocaleString()}`);
                                }
                            }}
                            disabled={running}
                            className="px-4 py-2 rounded font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            📂 Load Brain
                        </button>
                    </div>
                </div>

                {/* Saved State Indicator */}
                {savedState && (
                    <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded text-sm text-blue-300">
                        📂 <strong>Saved progress found:</strong> {savedState.currentDayIndex} days trained,
                        last date: {savedState.lastTrainedDate},
                        saved at: {new Date(savedState.savedAt).toLocaleString()}
                    </div>
                )}

                {/* Progress */}
                {running && (
                    <div className="mt-4 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded">
                        <div className="flex justify-between text-sm text-yellow-300 mb-2">
                            <span>Day {progress.day} of {progress.total}</span>
                            <span>{records.length} days processed</span>
                            <span>Win Rate: {(progress.winRate * 100).toFixed(1)}%</span>
                            <span className={progress.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                P&L: ${progress.pnl.toFixed(2)}
                            </span>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-3">
                            <div
                                className="bg-yellow-500 h-3 rounded-full transition-all"
                                style={{ width: `${progress.total > 0 ? (progress.day / progress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Final Results */}
            {session && (
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h2 className="font-bold text-white mb-4">📊 Learning Complete</h2>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-5 gap-4 mb-6">
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">{session.totalDays}</div>
                            <div className="text-sm text-gray-400">Days</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">{session.totalTrades}</div>
                            <div className="text-sm text-gray-400">Trades</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${session.winRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                                {(session.winRate * 100).toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-400">Win Rate</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-green-400">{session.totalWins}</div>
                            <div className="text-sm text-gray-400">Wins</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${session.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ${session.totalPnL.toFixed(2)}
                            </div>
                            <div className="text-sm text-gray-400">Total P&L</div>
                        </div>
                    </div>

                    {/* Expert Evolution */}
                    <h3 className="font-bold text-white mb-2">Expert Weight Evolution</h3>
                    <div className="grid grid-cols-5 gap-3 mb-6">
                        {Object.entries(session.experts)
                            .sort((a, b) => b[1].weight - a[1].weight)
                            .map(([name, exp]) => (
                                <div key={name} className="bg-gray-700 rounded p-3">
                                    <div className="font-bold text-white text-sm">{name}</div>
                                    <div className="text-xs text-gray-400">
                                        Weight: {(exp.weight * 100).toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {exp.trades} trades, {exp.trades > 0
                                            ? ((exp.correctPredictions / exp.trades) * 100).toFixed(0)
                                            : 0}% accuracy
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Training Calendar */}
            <TrainingCalendar
                records={records}
                currentDate={currentDate}
                isRunning={running}
            />

            {/* Agent Team Performance */}
            <AgentTeamPanel
                trades={records.flatMap(r => r.trades)}
            />

            {/* Daily Records */}
            {records.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="font-bold text-white mb-4">
                        📅 Daily Records ({records.length} days)
                    </h2>
                    <div className="max-h-[500px] overflow-y-auto">
                        {records.slice().reverse().map(record => (
                            <DayCard key={record.day} record={record} />
                        ))}
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="mt-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg text-sm text-green-300/80">
                <strong>How It Works:</strong>
                <ul className="mt-2 space-y-1">
                    <li>• Uses 15+ real indicators (RSI, MACD, Stochastic, ADX, Ichimoku, etc.)</li>
                    <li>• 10 expert modules each contribute weighted signals</li>
                    <li>• Trades only when 3+ experts agree with 60%+ confidence</li>
                    <li>• After each trade, lessons are extracted and weights adjusted</li>
                    <li>• Every single day is processed individually - no skipping</li>
                </ul>
            </div>
        </div>
    );
}
