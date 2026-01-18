'use client';

/**
 * Reinforcement Training Page
 * 
 * Train agents on real historical data with reward/penalty learning.
 */

import { useState, useCallback } from 'react';
import {
    getReinforcementEngine,
    type TrainingSession,
    type ExpertStats,
    type EpisodeResult
} from '@/lib/training';

function ExpertCard({ stats }: { stats: ExpertStats }) {
    const accuracyColor = stats.accuracy >= 0.55 ? 'text-green-400' :
        stats.accuracy >= 0.45 ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className="bg-gray-700 rounded p-3">
            <div className="font-bold text-white mb-2">{stats.name}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <span className="text-gray-400">Accuracy:</span>
                    <span className={`ml-2 ${accuracyColor}`}>
                        {(stats.accuracy * 100).toFixed(1)}%
                    </span>
                </div>
                <div>
                    <span className="text-gray-400">Weight:</span>
                    <span className="ml-2 text-white">{stats.currentWeight.toFixed(3)}</span>
                </div>
                <div>
                    <span className="text-gray-400">Episodes:</span>
                    <span className="ml-2 text-white">{stats.totalEpisodes}</span>
                </div>
                <div>
                    <span className="text-gray-400">Reward:</span>
                    <span className={`ml-2 ${stats.totalReward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.totalReward.toFixed(1)}
                    </span>
                </div>
            </div>
        </div>
    );
}

function EpisodeRow({ episode }: { episode: EpisodeResult }) {
    return (
        <tr className="border-t border-gray-700 text-sm">
            <td className="py-2">{new Date(episode.timestamp).toLocaleDateString()}</td>
            <td className="py-2">{episode.symbol}</td>
            <td className={`py-2 ${episode.predictedDirection === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                {episode.predictedDirection.toUpperCase()}
            </td>
            <td className={`py-2 ${episode.actualReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(episode.actualReturn * 100).toFixed(2)}%
            </td>
            <td className="py-2">
                {episode.success ? '✅' : '❌'}
            </td>
            <td className={`py-2 ${episode.reward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {episode.reward >= 0 ? '+' : ''}{episode.reward.toFixed(2)}
            </td>
        </tr>
    );
}

export default function ReinforcementPage() {
    const [session, setSession] = useState<TrainingSession | null>(null);
    const [running, setRunning] = useState(false);
    const [episodes, setEpisodes] = useState<EpisodeResult[]>([]);
    const [expertStats, setExpertStats] = useState<Record<string, ExpertStats>>({});

    // Training config
    const [monthsBack, setMonthsBack] = useState(24);
    const [holdoutMonths, setHoldoutMonths] = useState(3);

    const startTraining = useCallback(async () => {
        setRunning(true);

        try {
            const engine = getReinforcementEngine({
                startDate: new Date(Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000),
                endDate: new Date(Date.now() - holdoutMonths * 30 * 24 * 60 * 60 * 1000),
            });

            const result = await engine.train((progress) => {
                setSession({ ...progress });
                setExpertStats({ ...progress.expertStats });
            });

            setSession(result);
            setEpisodes(engine.getEpisodes().slice(-100)); // Last 100
            setExpertStats(result.expertStats);
        } catch (error) {
            console.error('Training failed:', error);
        } finally {
            setRunning(false);
        }
    }, [monthsBack, holdoutMonths]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">🎮 Reinforcement Training</h1>
            <p className="text-gray-400 mb-6">
                Train agents on real historical data. Correct predictions earn rewards, wrong predictions earn penalties.
            </p>

            {/* Config */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <h2 className="font-bold text-white mb-4">Training Configuration</h2>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Training Period (months back)</label>
                        <input
                            type="number"
                            value={monthsBack}
                            onChange={e => setMonthsBack(Number(e.target.value))}
                            min={3}
                            max={36}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Holdout (months)</label>
                        <input
                            type="number"
                            value={holdoutMonths}
                            onChange={e => setHoldoutMonths(Number(e.target.value))}
                            min={1}
                            max={12}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={startTraining}
                            disabled={running}
                            className={`w-full px-6 py-2 rounded font-bold ${running
                                ? 'bg-gray-600 text-gray-400 cursor-wait'
                                : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                        >
                            {running ? '🔄 Training...' : '🚀 Start Training'}
                        </button>
                    </div>
                </div>

                {running && session && (
                    <div className="mt-4 p-3 bg-gray-700 rounded">
                        <div className="text-sm text-gray-400 mb-2">
                            Progress: {session.episodesCompleted} episodes |
                            Symbol: {session.currentSymbol} |
                            Date: {session.currentDate}
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(100, session.episodesCompleted / 10)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Results Summary */}
            {session && session.status !== 'running' && (
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h2 className="font-bold text-white mb-4">Training Results</h2>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">{session.episodesCompleted}</div>
                            <div className="text-sm text-gray-400">Episodes</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${session.overallAccuracy >= 0.55 ? 'text-green-400' : 'text-yellow-400'
                                }`}>
                                {(session.overallAccuracy * 100).toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-400">Accuracy</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className={`text-2xl font-bold ${session.totalReward >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                {session.totalReward >= 0 ? '+' : ''}{session.totalReward.toFixed(1)}
                            </div>
                            <div className="text-sm text-gray-400">Total Reward</div>
                        </div>
                        <div className="bg-gray-700 rounded p-3 text-center">
                            <div className="text-2xl font-bold text-white">
                                {session.status === 'completed' ? '✅' : '❌'}
                            </div>
                            <div className="text-sm text-gray-400">{session.status}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expert Performance */}
            {Object.keys(expertStats).length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h2 className="font-bold text-white mb-4">Expert Performance & Learned Weights</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.values(expertStats)
                            .filter(s => s.totalEpisodes > 0)
                            .sort((a, b) => b.accuracy - a.accuracy)
                            .map(stats => (
                                <ExpertCard key={stats.name} stats={stats} />
                            ))}
                    </div>
                </div>
            )}

            {/* Recent Episodes */}
            {episodes.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="font-bold text-white mb-4">Recent Episodes (Last 100)</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-white">
                            <thead>
                                <tr className="text-gray-400 text-left text-sm">
                                    <th className="pb-2">Date</th>
                                    <th className="pb-2">Symbol</th>
                                    <th className="pb-2">Predicted</th>
                                    <th className="pb-2">Actual Return</th>
                                    <th className="pb-2">Result</th>
                                    <th className="pb-2">Reward</th>
                                </tr>
                            </thead>
                            <tbody>
                                {episodes.slice(-20).reverse().map(ep => (
                                    <EpisodeRow key={ep.id} episode={ep} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Info boxes */}
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg text-sm text-blue-300/80">
                    <strong>🎯 How It Works</strong>: Agents make predictions on historical data.
                    Correct predictions earn rewards (+1.0), wrong predictions earn penalties (-0.5).
                    Expert weights adjust based on their individual performance.
                </div>
                <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg text-sm text-green-300/80">
                    <strong>📈 Goal</strong>: Build a core brain by learning which experts
                    are reliable in which conditions. Better experts get higher weights.
                </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300/80">
                <strong>⚠️ Educational Tool</strong>: Past performance does not guarantee future results.
            </div>
        </div>
    );
}
