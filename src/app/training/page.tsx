'use client';

/**
 * Training Page
 * 
 * Run historical replay and view calibration reports.
 */

import { useState } from 'react';
import { getReplayRunner, type ReplayResult, type CalibrationReport } from '@/lib/training';

export default function TrainingPage() {
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<ReplayResult[]>([]);
    const [report, setReport] = useState<CalibrationReport | null>(null);
    const [daysToReplay, setDaysToReplay] = useState(5);

    const runReplay = async () => {
        setRunning(true);

        try {
            const runner = getReplayRunner();
            runner.clearResults();

            // Replay last N days
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - daysToReplay);

            await runner.replayRange(start, end);

            setResults(runner.getResults());
            setReport(runner.generateReport());
        } catch (error) {
            console.error('Replay failed:', error);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">Training Pipeline</h1>
            <p className="text-gray-400 mb-6">
                Run historical replay to evaluate and calibrate forecasts.
            </p>

            {/* Controls */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Days to Replay</label>
                        <input
                            type="number"
                            value={daysToReplay}
                            onChange={e => setDaysToReplay(Number(e.target.value))}
                            min={1}
                            max={30}
                            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white w-24"
                        />
                    </div>
                    <div className="flex-1" />
                    <button
                        onClick={runReplay}
                        disabled={running}
                        className={`px-6 py-2 rounded font-bold ${running
                                ? 'bg-gray-600 text-gray-400 cursor-wait'
                                : 'bg-accent text-black hover:bg-accent/90'
                            }`}
                    >
                        {running ? 'Running...' : 'Run Replay'}
                    </button>
                </div>

                {running && (
                    <div className="mt-4 text-sm text-gray-400 animate-pulse">
                        ⏳ Replaying historical data with anti-lookahead protection...
                    </div>
                )}
            </div>

            {/* Calibration Report */}
            {report && (
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <h2 className="text-lg font-bold text-white mb-4">Calibration Report</h2>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-gray-700 rounded p-3">
                            <div className="text-sm text-gray-400">Accuracy</div>
                            <div className={`text-2xl font-bold ${report.overallAccuracy >= 0.55 ? 'text-green-400' : 'text-yellow-400'
                                }`}>
                                {(report.overallAccuracy * 100).toFixed(1)}%
                            </div>
                        </div>
                        <div className="bg-gray-700 rounded p-3">
                            <div className="text-sm text-gray-400">MAE</div>
                            <div className="text-2xl font-bold text-white">
                                {(report.overallMAE * 100).toFixed(2)}%
                            </div>
                        </div>
                        <div className="bg-gray-700 rounded p-3">
                            <div className="text-sm text-gray-400">Interval Coverage</div>
                            <div className={`text-2xl font-bold ${report.intervalCoverage >= 0.7 ? 'text-green-400' : 'text-yellow-400'
                                }`}>
                                {(report.intervalCoverage * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Recommendations */}
                    {report.recommendations.length > 0 && (
                        <div className="bg-gray-700 rounded p-3">
                            <div className="text-sm text-gray-400 mb-2">Recommendations</div>
                            <ul className="text-sm text-white space-y-1">
                                {report.recommendations.map((rec, i) => (
                                    <li key={i}>• {rec}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Session Results */}
            {results.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h2 className="text-lg font-bold text-white mb-4">Session Results</h2>

                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-400 text-left">
                                <th className="pb-2">Date</th>
                                <th className="pb-2">Forecasts</th>
                                <th className="pb-2">Accuracy</th>
                                <th className="pb-2">MAE</th>
                                <th className="pb-2">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="text-white">
                            {results.map(result => (
                                <tr key={result.sessionId} className="border-t border-gray-700">
                                    <td className="py-2">{result.date.toISOString().slice(0, 10)}</td>
                                    <td className="py-2">{result.forecastsEvaluated}</td>
                                    <td className={`py-2 ${result.directionalAccuracy >= 0.55 ? 'text-green-400' : 'text-gray-400'
                                        }`}>
                                        {(result.directionalAccuracy * 100).toFixed(1)}%
                                    </td>
                                    <td className="py-2">{(result.meanAbsoluteError * 100).toFixed(2)}%</td>
                                    <td className="py-2 text-gray-400">{result.durationMs}ms</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Anti-lookahead notice */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg text-sm text-blue-300/80">
                <strong>🔒 Anti-Lookahead Protection</strong>: Forecasts are generated using only
                data available at prediction time. Future bars are never used for predictions.
            </div>

            {/* Disclaimer */}
            <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300/80">
                <strong>⚠️ Educational Tool</strong>: Past performance does not guarantee future results.
            </div>
        </div>
    );
}
