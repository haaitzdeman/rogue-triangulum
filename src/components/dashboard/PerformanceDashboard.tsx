'use client';

/**
 * Performance Dashboard Component
 * 
 * Shows forecast accuracy, calibration, and per-brain breakdown.
 */

import { useState, useEffect } from 'react';
import { getForecastTracker, type AccuracyStats } from '@/lib/forecast';

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    color?: 'green' | 'red' | 'yellow' | 'blue';
}

function StatCard({ label, value, subtext, color = 'blue' }: StatCardProps) {
    const colorClasses = {
        green: 'text-green-400',
        red: 'text-red-400',
        yellow: 'text-yellow-400',
        blue: 'text-blue-400',
    };

    return (
        <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${colorClasses[color]}`}>
                {value}
            </div>
            {subtext && (
                <div className="text-xs text-gray-500 mt-1">{subtext}</div>
            )}
        </div>
    );
}

export function PerformanceDashboard() {
    const [stats, setStats] = useState<AccuracyStats | null>(null);
    const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week');
    const [storeStats, setStoreStats] = useState({ forecasts: 0, outcomes: 0 });

    useEffect(() => {
        const tracker = getForecastTracker();
        setStats(tracker.getAccuracyStats(period));
        setStoreStats(tracker.getStoreStats());

        // Refresh every 30 seconds
        const interval = setInterval(() => {
            setStats(tracker.getAccuracyStats(period));
            setStoreStats(tracker.getStoreStats());
        }, 30000);

        return () => clearInterval(interval);
    }, [period]);

    if (!stats) {
        return <div className="text-gray-400">Loading stats...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex gap-2">
                {(['day', 'week', 'month', 'all'] as const).map(p => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-2 rounded capitalize ${period === p
                                ? 'bg-accent text-black'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                    >
                        {p === 'all' ? 'All Time' : `Last ${p}`}
                    </button>
                ))}
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard
                    label="Total Forecasts"
                    value={stats.totalForecasts}
                    subtext={`${stats.pending} pending`}
                    color="blue"
                />
                <StatCard
                    label="Directional Accuracy"
                    value={`${(stats.directionalAccuracy * 100).toFixed(1)}%`}
                    subtext={`${stats.evaluated} evaluated`}
                    color={stats.directionalAccuracy >= 0.55 ? 'green' : stats.directionalAccuracy >= 0.45 ? 'yellow' : 'red'}
                />
                <StatCard
                    label="Mean Absolute Error"
                    value={`${(stats.meanAbsoluteError * 100).toFixed(2)}%`}
                    subtext="avg return error"
                    color={stats.meanAbsoluteError < 0.02 ? 'green' : stats.meanAbsoluteError < 0.05 ? 'yellow' : 'red'}
                />
                <StatCard
                    label="Interval Coverage"
                    value={`${(stats.intervalCoverage * 100).toFixed(1)}%`}
                    subtext="within predicted range"
                    color={stats.intervalCoverage >= 0.7 ? 'green' : stats.intervalCoverage >= 0.5 ? 'yellow' : 'red'}
                />
            </div>

            {/* Store Stats */}
            <div className="text-sm text-gray-500">
                Store: {storeStats.forecasts} forecasts, {storeStats.outcomes} outcomes
            </div>

            {/* Per-Brain Breakdown */}
            <div>
                <h3 className="text-lg font-bold text-white mb-3">By Brain</h3>
                <div className="grid grid-cols-4 gap-4">
                    {Object.entries(stats.byBrain).map(([desk, data]) => (
                        <div key={desk} className="bg-gray-800 rounded-lg p-4">
                            <div className="text-sm text-gray-400 capitalize mb-2">
                                {desk.replace('-', ' ')}
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Forecasts:</span>
                                    <span className="text-white">{data.forecasts}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Accuracy:</span>
                                    <span className={data.accuracy >= 0.55 ? 'text-green-400' : 'text-gray-300'}>
                                        {(data.accuracy * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">MAE:</span>
                                    <span className="text-gray-300">
                                        {(data.mae * 100).toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Empty State */}
            {stats.totalForecasts === 0 && (
                <div className="text-center py-8 text-gray-500">
                    No forecasts yet. Start analyzing candidates to build history.
                </div>
            )}
        </div>
    );
}
