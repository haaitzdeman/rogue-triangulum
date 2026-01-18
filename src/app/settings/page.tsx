"use client";

import { useState, useEffect } from "react";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";
import type { BrainState } from "@/lib/training/meticulous-engine";

const BRAIN_STORAGE_KEY = 'meticulous-brain-state';
const BRAIN_HISTORY_KEY = 'meticulous-brain-history';

interface SavedBrain {
    id: string;
    name: string;
    exportDate: string;
    version: string;
    expertCount: number;
    patternsCount: number;
}

export default function SettingsPage() {
    const [savedBrains, setSavedBrains] = useState<SavedBrain[]>([]);
    const [currentBrain, setCurrentBrain] = useState<BrainState | null>(null);

    useEffect(() => {
        // Load current brain
        const brainStr = localStorage.getItem(BRAIN_STORAGE_KEY);
        if (brainStr) {
            try {
                const brain = JSON.parse(brainStr) as BrainState;
                setCurrentBrain(brain);
            } catch (e) {
                console.error('Failed to parse brain:', e);
            }
        }

        // Load brain history
        const historyStr = localStorage.getItem(BRAIN_HISTORY_KEY);
        if (historyStr) {
            try {
                setSavedBrains(JSON.parse(historyStr));
            } catch (e) {
                console.error('Failed to parse brain history:', e);
            }
        }
    }, []);

    const saveBrainToHistory = () => {
        if (!currentBrain) return;

        const newEntry: SavedBrain = {
            id: Date.now().toString(),
            name: `Brain ${new Date(currentBrain.exportDate).toLocaleDateString()}`,
            exportDate: currentBrain.exportDate,
            version: currentBrain.version,
            expertCount: Object.keys(currentBrain.expertWeights).length,
            patternsCount: currentBrain.learnedPatterns.avoid.length + currentBrain.learnedPatterns.follow.length,
        };

        const updated = [...savedBrains, newEntry];
        setSavedBrains(updated);
        localStorage.setItem(BRAIN_HISTORY_KEY, JSON.stringify(updated));
        alert('Brain saved to history!');
    };

    const downloadBrain = () => {
        if (!currentBrain) return;
        const blob = new Blob([JSON.stringify(currentBrain, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brain-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const deleteBrain = (id: string) => {
        if (!confirm('Delete this brain from history?')) return;
        const updated = savedBrains.filter(b => b.id !== id);
        setSavedBrains(updated);
        localStorage.setItem(BRAIN_HISTORY_KEY, JSON.stringify(updated));
    };

    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Settings"
                icon={Cog6ToothIcon}
                color="foreground-muted"
                description="Application configuration and data management."
                stats={[
                    { label: "API Status", value: "Connected" },
                    { label: "Data Mode", value: "Live" },
                    { label: "Saved Brains", value: savedBrains.length.toString() },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Brain Manager */}
                <div className="card p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold mb-4">🧠 Brain Manager (Transfer Learning)</h2>

                    {/* Current Brain */}
                    <div className="mb-6 p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                        <h3 className="font-medium mb-2 text-purple-300">Current Brain</h3>
                        {currentBrain ? (
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-400">
                                    <p>Version: {currentBrain.version}</p>
                                    <p>Exported: {new Date(currentBrain.exportDate).toLocaleString()}</p>
                                    <p>Experts: {Object.keys(currentBrain.expertWeights).length}</p>
                                    <p>Patterns: {currentBrain.learnedPatterns.avoid.length + currentBrain.learnedPatterns.follow.length}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={saveBrainToHistory}
                                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                                    >
                                        Add to History
                                    </button>
                                    <button
                                        onClick={downloadBrain}
                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                                    >
                                        Download JSON
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No brain saved. Train your agents and click "Save Brain" on the Learning page.</p>
                        )}
                    </div>

                    {/* Saved Brains History */}
                    <h3 className="font-medium mb-2">Saved Brains History</h3>
                    {savedBrains.length > 0 ? (
                        <div className="space-y-2">
                            {savedBrains.map(brain => (
                                <div key={brain.id} className="flex items-center justify-between p-3 bg-gray-800 rounded">
                                    <div>
                                        <p className="font-medium text-white">{brain.name}</p>
                                        <p className="text-xs text-gray-400">
                                            v{brain.version} • {brain.expertCount} experts • {brain.patternsCount} patterns
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => deleteBrain(brain.id)}
                                        className="px-2 py-1 text-red-400 hover:text-red-300 text-sm"
                                    >
                                        🗑️ Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">No brains in history. Save your first brain after training!</p>
                    )}
                </div>

                {/* API Configuration */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">API Configuration</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-foreground-muted">Data Provider</label>
                            <input
                                type="text"
                                value="Polygon.io (massive.com)"
                                disabled
                                className="input mt-1 opacity-50"
                            />
                        </div>
                        <div>
                            <label className="text-sm text-foreground-muted">API Key</label>
                            <input
                                type="password"
                                value="••••••••••••"
                                disabled
                                className="input mt-1"
                            />
                        </div>
                        <div className="text-xs text-foreground-muted">
                            Rate Limit: 5 calls/minute | Historical: 2 years
                        </div>
                    </div>
                </div>

                {/* Data Mode */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">Data Mode</h2>
                    <div className="space-y-3">
                        {["Live Data", "Mock Data (Development)"].map((mode, i) => (
                            <label key={mode} className="flex items-center gap-3 p-3 rounded-lg bg-background-secondary cursor-pointer">
                                <input
                                    type="radio"
                                    name="dataMode"
                                    defaultChecked={i === 0}
                                    className="w-4 h-4 text-accent"
                                />
                                <span>{mode}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Export/Import */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">Data Management</h2>
                    <div className="space-y-3">
                        <button className="btn-secondary w-full">Export Journal + Settings</button>
                        <button className="btn-secondary w-full">Import Broker CSV</button>
                        <button className="btn-ghost w-full text-caution">Reset All Data</button>
                    </div>
                </div>

                {/* Beginner Mode */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">Display Settings</h2>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between">
                            <span>Default to Beginner Mode</span>
                            <input type="checkbox" defaultChecked className="w-5 h-5 text-accent rounded" />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Show Risk Warnings</span>
                            <input type="checkbox" defaultChecked className="w-5 h-5 text-accent rounded" />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Compact Candidate Cards</span>
                            <input type="checkbox" className="w-5 h-5 text-accent rounded" />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
