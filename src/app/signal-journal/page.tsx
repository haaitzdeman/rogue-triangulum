'use client';

/**
 * Signal Journal Page
 * 
 * Displays scanner signal tracking data, outcome evaluation results, 
 * and aggregated performance stats.
 * 
 * TERMINOLOGY: "tracking", "evaluation", "performance", "calibration"
 * NO ML/AI terminology.
 */

import React, { useEffect, useState } from 'react';
import type { SignalRecord, SignalOutcome, SignalJournalStats } from '@/lib/journal/signal-types';

// Types for API response
interface SignalWithOutcome extends SignalRecord {
    outcome: SignalOutcome | null;
}

interface JournalResponse {
    success: boolean;
    signals: SignalWithOutcome[];
    stats: SignalJournalStats;
    count: number;
}

interface ScoreBucketComparison {
    bucket: string;
    expectedWinRate: number;
    calibrationSampleSize: number;
    drift: number | null;
    insufficientDataNote?: string;
}

interface CalibrationStatusResponse {
    status: 'ON' | 'OFF' | 'STALE';
    reason: string;
    profile: {
        createdAt: string;
        dataRange: { symbolCount: number; totalSignals: number };
        benchmark: {
            winRate_base: number;
            winRate_calibrated: number;
            avgReturn_base: number;
            avgReturn_calibrated: number;
            sampleSize: number;
            calibrationApplied: boolean;
        } | null;
    } | null;
    scoreBuckets: ScoreBucketComparison[];
    thresholds: {
        minSampleSizePerBucket: number;
        maxProfileAgeDays: number;
    };
}

export default function SignalJournalPage() {
    const [signals, setSignals] = useState<SignalWithOutcome[]>([]);
    const [stats, setStats] = useState<SignalJournalStats | null>(null);
    const [calibration, setCalibration] = useState<CalibrationStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [evaluating, setEvaluating] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'evaluated'>('all');
    const [error, setError] = useState<string | null>(null);

    const fetchJournal = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/journal?status=${filter}`);
            const data = await response.json() as JournalResponse;

            if (data.success) {
                setSignals(data.signals);
                setStats(data.stats);
            } else {
                setError('Failed to load journal');
            }
        } catch (err) {
            setError('Error loading journal');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCalibrationStatus = async () => {
        try {
            const response = await fetch('/api/calibration/status');
            const data = await response.json() as CalibrationStatusResponse;
            setCalibration(data);
        } catch (err) {
            console.error('Error fetching calibration status:', err);
        }
    };

    const triggerEvaluation = async () => {
        try {
            setEvaluating(true);
            const response = await fetch('/api/journal/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await response.json();

            if (data.success) {
                alert(`Evaluation complete: ${data.evaluated} evaluated, ${data.skipped} skipped`);
                fetchJournal(); // Refresh
            } else {
                alert(`Evaluation failed: ${data.error}`);
            }
        } catch (err) {
            alert('Error triggering evaluation');
            console.error(err);
        } finally {
            setEvaluating(false);
        }
    };

    useEffect(() => {
        fetchJournal();
        fetchCalibrationStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    const formatDate = (timestamp: number | string) => {
        const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    };

    const formatPercent = (value: number | null | undefined) => {
        if (value === null || value === undefined) return '—';
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    };

    const getExitColor = (exitReason: string | undefined) => {
        if (exitReason === 'target') return 'text-green-400';
        if (exitReason === 'stop') return 'text-red-400';
        return 'text-yellow-400';
    };

    const getStatusColor = (status: string) => {
        if (status === 'ON') return 'bg-green-900/50 text-green-400 border-green-600';
        if (status === 'STALE') return 'bg-yellow-900/50 text-yellow-400 border-yellow-600';
        return 'bg-red-900/50 text-red-400 border-red-600';
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Signal Journal</h1>
                        <p className="text-gray-400 mt-1">
                            Performance tracking & outcome evaluation
                        </p>
                    </div>
                    <div className="flex gap-4 items-center">
                        {/* Calibration Status Badge */}
                        {calibration && (
                            <div className={`px-3 py-1 rounded border text-sm font-medium ${getStatusColor(calibration.status)}`}>
                                Calibration: {calibration.status}
                            </div>
                        )}
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as 'all' | 'pending' | 'evaluated')}
                            className="bg-gray-800 border border-gray-700 rounded px-4 py-2"
                        >
                            <option value="all">All Signals</option>
                            <option value="pending">Pending</option>
                            <option value="evaluated">Evaluated</option>
                        </select>
                        <button
                            onClick={triggerEvaluation}
                            disabled={evaluating}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded font-medium"
                        >
                            {evaluating ? 'Evaluating...' : 'Run Evaluation'}
                        </button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-900/50 border border-red-700 rounded p-4 mb-6">
                        {error}
                    </div>
                )}

                {/* Calibration Info Panel */}
                {calibration && calibration.status !== 'OFF' && calibration.profile?.benchmark && (
                    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-blue-300">📊 Calibration Benchmark</h3>
                                <p className="text-xs text-gray-400 mt-1">{calibration.reason}</p>
                            </div>
                            <div className="flex gap-6 text-sm">
                                <div>
                                    <div className="text-gray-400">Base Win Rate</div>
                                    <div className="text-lg font-mono">{(calibration.profile.benchmark.winRate_base * 100).toFixed(1)}%</div>
                                </div>
                                <div className="text-2xl text-gray-600">→</div>
                                <div>
                                    <div className="text-gray-400">Calibrated Win Rate</div>
                                    <div className="text-lg font-mono text-green-400">{(calibration.profile.benchmark.winRate_calibrated * 100).toFixed(1)}%</div>
                                </div>
                                <div className="border-l border-gray-600 pl-6">
                                    <div className="text-gray-400">Sample Size</div>
                                    <div className="text-lg font-mono">{calibration.profile.benchmark.sampleSize.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Overview */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <StatCard
                            label="Total Signals"
                            value={stats.totalSignals}
                        />
                        <StatCard
                            label="Evaluated"
                            value={stats.evaluated}
                            subtext={`${stats.pending} pending`}
                        />
                        <StatCard
                            label="Hit Target Rate"
                            value={`${(stats.hitTargetRate * 100).toFixed(1)}%`}
                            color={stats.hitTargetRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}
                        />
                        <StatCard
                            label="Avg MFE / MAE"
                            value={`${stats.avgMFE.toFixed(1)}% / ${stats.avgMAE.toFixed(1)}%`}
                        />
                    </div>
                )}

                {/* Strategy Performance */}
                {stats && Object.keys(stats.byStrategy).length > 0 && (
                    <div className="bg-gray-800/50 rounded-lg p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-4">Strategy Performance</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(stats.byStrategy).map(([name, perf]) => (
                                <div key={name} className="bg-gray-700/50 rounded p-4">
                                    <div className="font-medium text-lg">{name}</div>
                                    <div className="text-sm text-gray-400 mt-2">
                                        <div>Count: {perf.count}</div>
                                        <div>Avg Score: {perf.avgScore.toFixed(0)}</div>
                                        <div className={perf.hitTargetRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}>
                                            Hit Target: {(perf.hitTargetRate * 100).toFixed(0)}%
                                        </div>
                                        <div>MFE: {perf.avgMFE.toFixed(1)}% | MAE: {perf.avgMAE.toFixed(1)}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Regime Performance */}
                {stats && (
                    <div className="bg-gray-800/50 rounded-lg p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-4">Regime Analysis</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <RegimeCard label="Trending" perf={stats.byRegime.trending} />
                            <RegimeCard label="Choppy" perf={stats.byRegime.choppy} />
                            <RegimeCard label="High Vol" perf={stats.byRegime.highVol} />
                            <RegimeCard label="Low Vol" perf={stats.byRegime.lowVol} />
                        </div>
                    </div>
                )}

                {/* Score Buckets - Expected vs Realized */}
                {stats && Object.keys(stats.byScoreBucket).length > 0 && (
                    <div className="bg-gray-800/50 rounded-lg p-6 mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">Expected vs Realized by Score</h2>
                            {calibration && calibration.status !== 'OFF' && (
                                <span className="text-xs text-gray-400">Expected from calibration profile</span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {Object.entries(stats.byScoreBucket)
                                .sort((a, b) => b[0].localeCompare(a[0]))
                                .map(([bucket, perf]) => {
                                    // Find expected from calibration scoreBuckets
                                    const calibBucket = calibration?.scoreBuckets?.find(
                                        (b: ScoreBucketComparison) => b.bucket === bucket
                                    );
                                    const minSampleSize = calibration?.thresholds?.minSampleSizePerBucket || 200;
                                    const hasEnoughRealized = perf.count >= minSampleSize;

                                    // Calculate drift only when both have enough samples
                                    const canCalculateDrift = calibBucket &&
                                        calibBucket.calibrationSampleSize >= minSampleSize &&
                                        hasEnoughRealized;
                                    const drift = canCalculateDrift
                                        ? (perf.hitTargetRate - calibBucket.expectedWinRate) * 100
                                        : null;

                                    return (
                                        <div key={bucket} className="bg-gray-700/50 rounded p-3 text-center">
                                            <div className="font-mono text-lg">{bucket}</div>
                                            <div className="text-xs text-gray-400 mt-1">n={perf.count}</div>

                                            {/* Expected */}
                                            {calibBucket && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Exp: {(calibBucket.expectedWinRate * 100).toFixed(0)}%
                                                </div>
                                            )}

                                            {/* Realized - only show if enough samples */}
                                            {hasEnoughRealized ? (
                                                <div className={`text-lg font-semibold ${perf.hitTargetRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {(perf.hitTargetRate * 100).toFixed(0)}%
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-500 mt-2">
                                                    Insufficient sample (&lt;{minSampleSize})
                                                </div>
                                            )}

                                            {/* Drift indicator */}
                                            {drift !== null && (
                                                <div className={`text-xs ${Math.abs(drift) < 5 ? 'text-gray-500' :
                                                    drift > 0 ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                    {drift > 0 ? '+' : ''}{drift.toFixed(0)}% drift
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Signal List */}
                <div className="bg-gray-800/50 rounded-lg p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        Signals ({signals.length})
                    </h2>

                    {loading ? (
                        <div className="text-center text-gray-400 py-8">Loading...</div>
                    ) : signals.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                            No signals recorded yet. Run a scan to start tracking.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-gray-700">
                                        <th className="pb-3 pr-4">Date</th>
                                        <th className="pb-3 pr-4">Symbol</th>
                                        <th className="pb-3 pr-4">Strategy</th>
                                        <th className="pb-3 pr-4">Dir</th>
                                        <th className="pb-3 pr-4">Score</th>
                                        <th className="pb-3 pr-4">Status</th>
                                        <th className="pb-3 pr-4">Exit</th>
                                        <th className="pb-3 pr-4">Return</th>
                                        <th className="pb-3 pr-4">MFE</th>
                                        <th className="pb-3 pr-4">MAE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {signals.map((signal) => (
                                        <tr key={signal.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                            <td className="py-3 pr-4">{formatDate(signal.signalBarTimestamp)}</td>
                                            <td className="py-3 pr-4 font-medium">{signal.symbol}</td>
                                            <td className="py-3 pr-4">{signal.strategyName}</td>
                                            <td className={`py-3 pr-4 ${signal.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                                {signal.direction.toUpperCase()}
                                            </td>
                                            <td className="py-3 pr-4">{signal.score}</td>
                                            <td className="py-3 pr-4">
                                                <span className={`px-2 py-1 rounded text-xs ${signal.status === 'evaluated' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'
                                                    }`}>
                                                    {signal.status}
                                                </span>
                                            </td>
                                            <td className={`py-3 pr-4 ${getExitColor(signal.outcome?.exitReason)}`}>
                                                {signal.outcome?.exitReason?.toUpperCase() || '—'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {formatPercent(signal.outcome?.return7Bar)}
                                            </td>
                                            <td className="py-3 pr-4 text-green-400">
                                                {formatPercent(signal.outcome?.mfe)}
                                            </td>
                                            <td className="py-3 pr-4 text-red-400">
                                                {formatPercent(signal.outcome?.mae)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Note */}
                <div className="text-center text-gray-500 text-sm mt-8">
                    Performance tracking only • No predictions • Data stored locally
                </div>
            </div>
        </div>
    );
}

// Helper Components
function StatCard({
    label,
    value,
    subtext,
    color = 'text-white'
}: {
    label: string;
    value: string | number;
    subtext?: string;
    color?: string;
}) {
    return (
        <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-gray-400 text-sm">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
            {subtext && <div className="text-gray-500 text-sm">{subtext}</div>}
        </div>
    );
}

function RegimeCard({
    label,
    perf
}: {
    label: string;
    perf: { count: number; hitTargetRate: number; avgMFE: number; avgMAE: number };
}) {
    return (
        <div className="bg-gray-700/50 rounded p-4">
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-400 mt-2">
                <div>Count: {perf.count}</div>
                <div className={perf.hitTargetRate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}>
                    Hit Target: {(perf.hitTargetRate * 100).toFixed(0)}%
                </div>
                <div>MFE: {perf.avgMFE.toFixed(1)}%</div>
            </div>
        </div>
    );
}
