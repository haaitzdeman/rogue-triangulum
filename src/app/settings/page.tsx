"use client";

/**
 * Settings Page
 * 
 * Refactored: Removed brain state management (fake learning removed)
 */

import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";

export default function SettingsPage() {
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
                    { label: "System", value: "Strategy Scanner" },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* System Info */}
                <div className="card p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold mb-4">📊 System Info</h2>
                    <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                        <h3 className="font-medium mb-2 text-blue-300">Architecture</h3>
                        <div className="text-sm text-gray-400 space-y-1">
                            <p>• <strong>Type:</strong> Strategy Scanner + Backtester + Paper Trading</p>
                            <p>• <strong>Phase:</strong> A (Daily bars only)</p>
                            <p>• <strong>Strategies:</strong> Momentum, Breakout, Mean Reversion, Trend Follow</p>
                            <p>• <strong>Data:</strong> Polygon.io (daily OHLCV)</p>
                        </div>
                        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700/30 rounded text-yellow-300 text-sm">
                            ⚠️ This system does NOT use AI/ML learning. Strategies are rule-based with forecast tracking.
                        </div>
                    </div>
                </div>

                {/* API Configuration */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">API Configuration</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-foreground-muted">Data Provider</label>
                            <input
                                type="text"
                                value="Polygon.io"
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
                            Rate Limit: 5 calls/minute | Historical: 2 years (Starter)
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

                {/* Display Settings */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">Display Settings</h2>
                    <div className="space-y-4">
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
