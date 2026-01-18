"use client";

import { BeakerIcon } from "@heroicons/react/24/outline";
import { DeskHeader } from "@/components/desk/DeskHeader";

export default function BrainPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <DeskHeader
                title="Brain"
                icon={BeakerIcon}
                color="accent"
                description="Expert system, mHC mixer, and learning loop configuration."
                stats={[
                    { label: "Experts", value: "7" },
                    { label: "Model Version", value: "1.0" },
                    { label: "Updates", value: "12" },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Experts Overview */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">Expert Modules</h2>
                    <div className="space-y-3">
                        {[
                            { name: "Momentum Expert", weight: 0.18, desk: "Day/Swing" },
                            { name: "Mean Reversion Expert", weight: 0.14, desk: "Day/Swing" },
                            { name: "Breakout Expert", weight: 0.16, desk: "Day/Swing" },
                            { name: "Trend Following Expert", weight: 0.15, desk: "Swing/Invest" },
                            { name: "IV/Skew Expert", weight: 0.12, desk: "Options" },
                            { name: "Liquidity Expert", weight: 0.13, desk: "Day/Options" },
                            { name: "Regime Expert", weight: 0.12, desk: "All" },
                        ].map((expert) => (
                            <div key={expert.name} className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                                <div>
                                    <span className="font-medium">{expert.name}</span>
                                    <span className="text-xs text-foreground-muted ml-2">{expert.desk}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 confidence-meter">
                                        <div
                                            className="confidence-fill bg-accent"
                                            style={{ width: `${expert.weight * 100 * 5}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-mono">{(expert.weight * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* mHC Mixer */}
                <div className="card p-6">
                    <h2 className="text-lg font-semibold mb-4">mHC Mixer Status</h2>
                    <div className="explain-panel mb-4">
                        <p className="text-sm">
                            <span className="explain-term">mHC (Manifold-Constrained Hyper-Connections)</span> ensures
                            expert weights stay balanced using Sinkhorn-Knopp normalization. This prevents any single
                            expert from dominating recommendations.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="metric-card">
                            <div className="metric-label">Sinkhorn Iterations</div>
                            <div className="metric-value">20</div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-label">Spectral Norm</div>
                            <div className="metric-value text-bullish">≤ 1.0</div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-label">Row Sum</div>
                            <div className="metric-value">1.00 ± 0.01</div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-label">Col Sum</div>
                            <div className="metric-value">1.00 ± 0.01</div>
                        </div>
                    </div>
                </div>

                {/* Model Change Log */}
                <div className="card p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold mb-4">Model Change Log</h2>
                    <div className="space-y-3">
                        {[
                            { date: "2024-01-15", type: "weight_update", desc: "Momentum expert +2% after strong trend trades", canRollback: true },
                            { date: "2024-01-14", type: "rule_added", desc: "Added rule: Skip trades with RVOL < 1.5x", canRollback: true },
                            { date: "2024-01-12", type: "calibration", desc: "Regime expert recalibrated for current VIX level", canRollback: false },
                        ].map((change, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-foreground-muted">{change.date}</span>
                                    <span className="badge badge-neutral">{change.type}</span>
                                    <span className="text-sm">{change.desc}</span>
                                </div>
                                {change.canRollback && (
                                    <button className="btn-ghost text-xs text-caution">Rollback</button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
