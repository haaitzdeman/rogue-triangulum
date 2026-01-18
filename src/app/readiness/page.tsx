'use client';

/**
 * Readiness Page
 * 
 * Shows which gates are satisfied and remaining steps to unlock LIVE.
 */

import { useState, useEffect } from 'react';
import { getReadinessGates, type ReadinessResult, type RiskProfile } from '@/lib/core';

function GateCard({
    name,
    passed,
    reason,
    current,
    required
}: {
    name: string;
    passed: boolean;
    reason: string;
    current?: string | number;
    required?: string | number;
}) {
    return (
        <div className={`
      p-4 rounded-lg border
      ${passed
                ? 'bg-green-900/20 border-green-500/50'
                : 'bg-gray-800 border-gray-600'}
    `}>
            <div className="flex items-center gap-3 mb-2">
                <div className={`text-2xl ${passed ? 'text-green-500' : 'text-gray-500'}`}>
                    {passed ? '✓' : '○'}
                </div>
                <div className="font-bold text-white">{name}</div>
            </div>
            <div className="text-sm text-gray-400">{reason}</div>
            {(current !== undefined || required !== undefined) && (
                <div className="mt-2 text-xs text-gray-500">
                    {current !== undefined && <span>Current: {current}</span>}
                    {current !== undefined && required !== undefined && <span> / </span>}
                    {required !== undefined && <span>Required: {required}</span>}
                </div>
            )}
        </div>
    );
}

function RiskProfileForm({
    onSave,
    existing
}: {
    onSave: (profile: Omit<RiskProfile, 'confirmedAt'>) => void;
    existing: RiskProfile | null;
}) {
    const [maxDailyLoss, setMaxDailyLoss] = useState(existing?.maxDailyLoss || 500);
    const [maxTradeRisk, setMaxTradeRisk] = useState(existing?.maxTradeRisk || 100);
    const [maxPositions, setMaxPositions] = useState(existing?.maxPositions || 5);
    const [maxTradesPerDay, setMaxTradesPerDay] = useState(existing?.maxTradesPerDay || 10);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ maxDailyLoss, maxTradeRisk, maxPositions, maxTradesPerDay });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 bg-gray-800 p-4 rounded-lg">
            <h3 className="font-bold text-white">Risk Profile Configuration</h3>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Daily Loss ($)</label>
                    <input
                        type="number"
                        value={maxDailyLoss}
                        onChange={e => setMaxDailyLoss(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Risk Per Trade ($)</label>
                    <input
                        type="number"
                        value={maxTradeRisk}
                        onChange={e => setMaxTradeRisk(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Positions</label>
                    <input
                        type="number"
                        value={maxPositions}
                        onChange={e => setMaxPositions(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Trades Per Day</label>
                    <input
                        type="number"
                        value={maxTradesPerDay}
                        onChange={e => setMaxTradesPerDay(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                </div>
            </div>

            <button
                type="submit"
                className="w-full px-4 py-2 bg-accent text-black font-bold rounded hover:bg-accent/90"
            >
                Confirm Risk Profile
            </button>

            {existing?.confirmedAt && (
                <div className="text-xs text-gray-500 text-center">
                    Last confirmed: {existing.confirmedAt.toLocaleString()}
                </div>
            )}
        </form>
    );
}

export default function ReadinessPage() {
    const [result, setResult] = useState<ReadinessResult | null>(null);
    const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);

    const refresh = () => {
        const gates = getReadinessGates();
        setResult(gates.checkAll());
        setRiskProfile(gates.getRiskProfile());
    };

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSaveRiskProfile = (profile: Omit<RiskProfile, 'confirmedAt'>) => {
        const gates = getReadinessGates();
        gates.setRiskProfile(profile);
        refresh();
    };

    if (!result) {
        return <div className="p-6 text-gray-400">Loading...</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-2">LIVE Mode Readiness</h1>
            <p className="text-gray-400 mb-6">
                Complete all gates to unlock LIVE trading mode.
            </p>

            {/* Status Banner */}
            <div className={`
        p-4 rounded-lg mb-6 flex items-center gap-4
        ${result.ready
                    ? 'bg-green-900/30 border border-green-500/50'
                    : 'bg-yellow-900/20 border border-yellow-600/50'}
      `}>
                <div className={`text-4xl ${result.ready ? 'text-green-500' : 'text-yellow-500'}`}>
                    {result.ready ? '✓' : '⏳'}
                </div>
                <div>
                    <div className={`text-lg font-bold ${result.ready ? 'text-green-400' : 'text-yellow-400'}`}>
                        {result.ready ? 'Ready for LIVE Trading' : 'Not Yet Ready'}
                    </div>
                    <div className="text-sm text-gray-400">
                        {result.passedCount} of {result.totalCount} gates passed
                    </div>
                </div>
                {result.ready && (
                    <button className="ml-auto px-6 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700">
                        Enable LIVE Mode
                    </button>
                )}
            </div>

            {/* Gates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {result.gates.map(gate => (
                    <GateCard
                        key={gate.name}
                        name={gate.name}
                        passed={gate.passed}
                        reason={gate.reason}
                        current={gate.current}
                        required={gate.required}
                    />
                ))}
            </div>

            {/* Risk Profile Form */}
            <RiskProfileForm
                onSave={handleSaveRiskProfile}
                existing={riskProfile}
            />

            {/* Disclaimer */}
            <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300/80">
                <strong>⚠️ Educational Tool</strong>: This is for personal use only.
                Trading involves substantial risk of loss. Past performance does not guarantee future results.
                This is not financial advice.
            </div>
        </div>
    );
}
