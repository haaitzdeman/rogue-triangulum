'use client';

/**
 * Options Scanner Page — /options
 *
 * Full scanner with:
 * - Symbol input + scan/force-rescan buttons
 * - IV Rank badge, Expected Move, Liquidity meter
 * - Strategy badge + rationale
 * - Contracts table with row selection
 * - History dropdown (load cached scans)
 * - Save to Journal button + modal
 * - Distinct error badges (NO_API_KEY, HTTP_xxx, FETCH_ERROR)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { computeOptionSizing, type RiskMode } from '@/lib/shared/sizing';

// =============================================================================
// Types (mirrors API response)
// =============================================================================

interface IVRankResult {
    rank: number | null;
    classification: 'HIGH' | 'MID' | 'LOW' | null;
    lowData: boolean;
}

interface ExpectedMoveResult {
    expectedMove: number;
    expectedRange: { low: number; high: number };
}

interface OptionContract {
    symbol: string;
    strike: number;
    expiration: string;
    type: 'CALL' | 'PUT';
    bid: number;
    ask: number;
    mid: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    daysToExpiration: number;
    bidAskSpreadPct: number;
}

type StrategySuggestion = 'LONG_CALL' | 'LONG_PUT' | 'DEBIT_SPREAD' | 'CREDIT_SPREAD' | 'AVOID';

interface ScanResponse {
    success: boolean;
    symbol?: string;
    underlyingPrice?: number;
    ivRank?: IVRankResult;
    expectedMove?: ExpectedMoveResult;
    liquidityScore?: number;
    strategySuggestion?: StrategySuggestion;
    rationale?: string;
    contracts?: OptionContract[];
    totalContractsScanned?: number;
    scannedAt?: string;
    fromCache?: boolean;
    error?: string;
    errorCode?: string;
}

interface HistoryEntry {
    date: string;
    symbol: string;
    strategySuggestion: string;
    ivRankValue: number | null;
    ivRankClassification: string | null;
    expectedMove: number;
    liquidityScore: number;
    scannedAt: string;
}

// =============================================================================
// Error Badge — distinct styling per error type
// =============================================================================

function ErrorDisplay({ error, errorCode }: { error: string; errorCode?: string }) {
    const codeColors: Record<string, string> = {
        NO_API_KEY: 'bg-orange-900/30 border-orange-700 text-orange-400',
        BAD_REQUEST: 'bg-yellow-900/30 border-yellow-700 text-yellow-400',
        FETCH_ERROR: 'bg-red-900/30 border-red-700 text-red-400',
        INTERNAL_ERROR: 'bg-red-900/30 border-red-700 text-red-400',
    };

    const defaultColor = 'bg-red-900/30 border-red-700 text-red-400';
    const isHttp = errorCode?.startsWith('HTTP_');
    const color = isHttp
        ? 'bg-purple-900/30 border-purple-700 text-purple-400'
        : (errorCode && codeColors[errorCode]) || defaultColor;

    const icon = errorCode === 'NO_API_KEY' ? '🔑' :
        isHttp ? '🌐' :
            errorCode === 'FETCH_ERROR' ? '📡' : '❌';

    return (
        <div className={`rounded-lg p-4 mb-6 border ${color}`}>
            <div className="flex items-start gap-3">
                <span className="text-lg">{icon}</span>
                <div>
                    {errorCode && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/30 mb-2 inline-block">
                            {errorCode}
                        </span>
                    )}
                    <p className="text-sm mt-1">{error}</p>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Badge Components
// =============================================================================

function IVRankBadge({ ivRank }: { ivRank: IVRankResult }) {
    if (ivRank.lowData || ivRank.rank === null) {
        return (
            <span className="px-2 py-1 text-xs font-medium rounded bg-gray-600/30 text-gray-400 border border-gray-600"
                title="Insufficient IV history to compute rank">
                LOW DATA
            </span>
        );
    }

    const pct = (ivRank.rank * 100).toFixed(0);
    const colorMap = {
        HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
        MID: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    const color = ivRank.classification ? colorMap[ivRank.classification] : colorMap.MID;

    return (
        <span className={`px-2 py-1 text-xs font-medium rounded border ${color}`}>
            {ivRank.classification} · {pct}%
        </span>
    );
}

function StrategyBadge({ strategy }: { strategy: StrategySuggestion }) {
    const colorMap: Record<StrategySuggestion, string> = {
        LONG_CALL: 'bg-green-500/20 text-green-400 border-green-500/30',
        LONG_PUT: 'bg-red-500/20 text-red-400 border-red-500/30',
        DEBIT_SPREAD: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        CREDIT_SPREAD: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        AVOID: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };

    const labelMap: Record<StrategySuggestion, string> = {
        LONG_CALL: '📈 Long Call',
        LONG_PUT: '📉 Long Put',
        DEBIT_SPREAD: '🔵 Debit Spread',
        CREDIT_SPREAD: '🟣 Credit Spread',
        AVOID: '⛔ Avoid',
    };

    return (
        <span className={`px-3 py-1.5 text-sm font-semibold rounded-lg border ${colorMap[strategy]}`}>
            {labelMap[strategy]}
        </span>
    );
}

function LiquidityMeter({ score }: { score: number }) {
    const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-xs text-gray-400">{score}/100</span>
        </div>
    );
}

// =============================================================================
// Contracts Table (with row selection)
// =============================================================================

function ContractsTable({
    contracts,
    selectedContract,
    onSelect,
}: {
    contracts: OptionContract[];
    selectedContract: OptionContract | null;
    onSelect: (c: OptionContract | null) => void;
}) {
    const [showAll, setShowAll] = useState(false);
    const [sortBy, setSortBy] = useState<'strike' | 'volume' | 'oi' | 'iv'>('strike');

    const sorted = [...contracts].sort((a, b) => {
        switch (sortBy) {
            case 'volume': return b.volume - a.volume;
            case 'oi': return b.openInterest - a.openInterest;
            case 'iv': return b.impliedVolatility - a.impliedVolatility;
            default: return a.strike - b.strike;
        }
    });

    const displayed = showAll ? sorted : sorted.slice(0, 20);

    return (
        <div className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <h3 className="text-sm font-medium text-gray-300">
                    📋 Filtered Contracts ({contracts.length})
                    {selectedContract && (
                        <span className="ml-2 text-xs text-blue-400">
                            · {selectedContract.type} ${selectedContract.strike} selected
                        </span>
                    )}
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sort:</span>
                    {(['strike', 'volume', 'oi', 'iv'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={`px-2 py-0.5 text-xs rounded ${sortBy === s
                                ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {s === 'oi' ? 'OI' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800/50 text-gray-400 text-xs">
                        <tr>
                            <th className="px-3 py-2 w-8"></th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Strike</th>
                            <th className="px-3 py-2">Exp</th>
                            <th className="px-3 py-2">DTE</th>
                            <th className="px-3 py-2">Bid</th>
                            <th className="px-3 py-2">Ask</th>
                            <th className="px-3 py-2">Mid</th>
                            <th className="px-3 py-2">Volume</th>
                            <th className="px-3 py-2">OI</th>
                            <th className="px-3 py-2">IV</th>
                            <th className="px-3 py-2">Spread%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map((c, i) => {
                            const isSelected = selectedContract?.symbol === c.symbol &&
                                selectedContract?.strike === c.strike &&
                                selectedContract?.expiration === c.expiration;
                            return (
                                <tr
                                    key={i}
                                    onClick={() => onSelect(isSelected ? null : c)}
                                    className={`border-t border-gray-800 cursor-pointer transition-colors ${isSelected
                                        ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                                        : 'hover:bg-gray-800/30'
                                        }`}
                                >
                                    <td className="px-3 py-2">
                                        <div className={`w-3 h-3 rounded-full border ${isSelected
                                            ? 'bg-blue-500 border-blue-400'
                                            : 'border-gray-600'
                                            }`} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${c.type === 'CALL'
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-red-500/20 text-red-400'
                                            }`}>
                                            {c.type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-gray-200">${c.strike.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-gray-400">{c.expiration}</td>
                                    <td className="px-3 py-2 text-gray-400">{c.daysToExpiration}d</td>
                                    <td className="px-3 py-2 font-mono text-gray-300">${c.bid.toFixed(2)}</td>
                                    <td className="px-3 py-2 font-mono text-gray-300">${c.ask.toFixed(2)}</td>
                                    <td className="px-3 py-2 font-mono text-gray-200">${c.mid.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-gray-300">{c.volume.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-gray-300">{c.openInterest.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-gray-300">{(c.impliedVolatility * 100).toFixed(1)}%</td>
                                    <td className={`px-3 py-2 ${c.bidAskSpreadPct > 5 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                        {c.bidAskSpreadPct.toFixed(1)}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {contracts.length > 20 && !showAll && (
                <div className="px-4 py-2 border-t border-gray-700">
                    <button
                        onClick={() => setShowAll(true)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                    >
                        Show all {contracts.length} contracts →
                    </button>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Journal Save Modal
// =============================================================================

function JournalModal({
    result,
    selectedContract,
    onClose,
}: {
    result: ScanResponse;
    selectedContract: OptionContract | null;
    onClose: () => void;
}) {
    const [status, setStatus] = useState<'PLANNED' | 'ENTERED' | 'EXITED' | 'CANCELED'>('PLANNED');
    const [userNote, setUserNote] = useState('');
    const [executionNotes, setExecutionNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
    const [riskMode, setRiskMode] = useState<RiskMode>('CONTRACTS');
    const [riskValue, setRiskValue] = useState('');
    const [accountSize, setAccountSize] = useState('');
    const [isDraft, setIsDraft] = useState(false);

    // Map strategy suggestion to sizing strategy
    const sizingStrategy = useMemo(() => {
        const s = result.strategySuggestion;
        if (s === 'LONG_CALL' || s === 'LONG_PUT' || s === 'DEBIT_SPREAD' || s === 'CREDIT_SPREAD') return s;
        return null;
    }, [result.strategySuggestion]);

    // Live sizing preview
    const sizingPreview = useMemo(() => {
        const rv = parseFloat(riskValue);
        if (!rv || riskMode === 'CONTRACTS' || !sizingStrategy) return null;
        return computeOptionSizing({
            riskMode,
            riskValue: rv,
            strategy: sizingStrategy,
            contractMid: selectedContract?.mid ?? undefined,
            accountSize: riskMode === 'RISK_PERCENT' ? parseFloat(accountSize) || undefined : undefined,
        });
    }, [riskMode, riskValue, accountSize, sizingStrategy, selectedContract]);

    const handleSave = async () => {
        setSaving(true);
        setSaveResult(null);

        try {
            const payload = {
                symbol: result.symbol!,
                strategySuggestion: result.strategySuggestion!,
                ivRank: result.ivRank!,
                expectedMove: result.expectedMove!,
                liquidityScore: result.liquidityScore!,
                rationale: result.rationale!,
                underlyingPrice: result.underlyingPrice!,
                scannedAt: result.scannedAt!,
                selectedContract: selectedContract ? {
                    symbol: selectedContract.symbol,
                    strike: selectedContract.strike,
                    expiration: selectedContract.expiration,
                    type: selectedContract.type,
                    bid: selectedContract.bid,
                    ask: selectedContract.ask,
                    mid: selectedContract.mid,
                } : null,
                status,
                executionNotes: executionNotes || undefined,
                userNote: userNote || undefined,
                // Sizing fields
                ...(riskMode !== 'CONTRACTS' ? {
                    riskMode,
                    riskValue: parseFloat(riskValue) || undefined,
                    accountSize: parseFloat(accountSize) || undefined,
                } : {}),
                isDraft,
            };

            const res = await fetch('/api/options/journal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (data.success) {
                setSaveResult({ success: true, message: `Saved! Signal ID: ${data.signalId}` });
            } else {
                setSaveResult({ success: false, message: data.message || 'Failed to save' });
            }
        } catch (err) {
            setSaveResult({ success: false, message: err instanceof Error ? err.message : 'Network error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">📝 Save to Journal</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
                </div>

                {/* Summary */}
                <div className="bg-gray-800/50 rounded-lg p-3 mb-4 text-sm space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Symbol</span>
                        <span className="text-white font-mono">{result.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Strategy</span>
                        <span className="text-white">{result.strategySuggestion}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">IV Rank</span>
                        <span className="text-white">
                            {result.ivRank?.rank !== null ? `${(result.ivRank!.rank! * 100).toFixed(0)}%` : 'N/A'}
                        </span>
                    </div>
                    {selectedContract && (
                        <div className="flex justify-between">
                            <span className="text-gray-400">Contract</span>
                            <span className="text-blue-400 text-xs">
                                {selectedContract.type} ${selectedContract.strike} {selectedContract.expiration}
                            </span>
                        </div>
                    )}
                </div>

                {/* Status */}
                <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Status</label>
                    <select
                        value={status}
                        onChange={e => setStatus(e.target.value as typeof status)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                    >
                        <option value="PLANNED">PLANNED</option>
                        <option value="ENTERED">ENTERED</option>
                        <option value="EXITED">EXITED</option>
                        <option value="CANCELED">CANCELED</option>
                    </select>
                </div>

                {/* Draft Toggle */}
                <div className="mb-4 flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="options-draft-toggle"
                        checked={isDraft}
                        onChange={e => setIsDraft(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="options-draft-toggle" className="text-xs text-gray-400 cursor-pointer">
                        Draft <span className="text-gray-600">(not counted toward risk limits)</span>
                    </label>
                </div>

                {/* Notes */}
                <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Notes</label>
                    <textarea
                        value={userNote}
                        onChange={e => setUserNote(e.target.value)}
                        placeholder="Why are you taking this trade..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white resize-none"
                        rows={2}
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Execution Notes</label>
                    <textarea
                        value={executionNotes}
                        onChange={e => setExecutionNotes(e.target.value)}
                        placeholder="Entry/exit details, fill prices..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white resize-none"
                        rows={2}
                    />
                </div>

                {/* Position Sizing */}
                {sizingStrategy && (
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs text-gray-400">Position Sizing</label>
                            <div className="flex text-[10px]">
                                {(['CONTRACTS', 'RISK_DOLLARS', 'RISK_PERCENT'] as RiskMode[]).map((mode) => {
                                    const labels: Record<RiskMode, string> = { CONTRACTS: 'Contracts', RISK_DOLLARS: 'Risk $', RISK_PERCENT: 'Risk %' };
                                    const isFirst = mode === 'CONTRACTS';
                                    const isLast = mode === 'RISK_PERCENT';
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setRiskMode(mode)}
                                            className={`px-2 py-0.5 border ${isFirst ? 'rounded-l' : ''} ${isLast ? 'rounded-r' : ''} ${riskMode === mode
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-gray-800 border-gray-600 text-gray-400'
                                                }`}
                                        >
                                            {labels[mode]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {riskMode !== 'CONTRACTS' && (
                            <>
                                <input
                                    type="number"
                                    value={riskValue}
                                    onChange={e => setRiskValue(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                                    placeholder={riskMode === 'RISK_DOLLARS' ? 'Max risk in dollars' : '% of account to risk'}
                                />
                                {riskMode === 'RISK_PERCENT' && (
                                    <input
                                        type="number"
                                        value={accountSize}
                                        onChange={e => setAccountSize(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white mt-1"
                                        placeholder="Account size ($)"
                                    />
                                )}
                                {sizingPreview && sizingPreview.suggestedContracts > 0 && (
                                    <div className="mt-1.5 p-2 bg-blue-900/20 border border-blue-800/30 rounded text-xs">
                                        <div className="text-blue-300">
                                            → {sizingPreview.suggestedContracts} contracts • Max loss: ${sizingPreview.maxLossDollars.toFixed(0)}
                                            {sizingPreview.buyingPowerEstimate != null && (
                                                <span className="text-gray-400"> • BP: ${sizingPreview.buyingPowerEstimate.toFixed(0)}</span>
                                            )}
                                        </div>
                                        {sizingPreview.assumptions.map((a, i) => (
                                            <div key={i} className="text-gray-500 text-[10px]">{a}</div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Save Result */}
                {saveResult && (
                    <div className={`text-sm mb-4 p-2 rounded ${saveResult.success
                        ? 'bg-green-900/30 text-green-400 border border-green-700'
                        : 'bg-red-900/30 text-red-400 border border-red-700'
                        }`}>
                        {saveResult.message}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving || saveResult?.success === true}
                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        {saving ? '⏳ Saving...' : saveResult?.success ? '✅ Saved' : '💾 Save Entry'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// History Dropdown
// =============================================================================

function HistoryDropdown({
    onSelect,
}: {
    onSelect: (date: string, symbol: string) => void;
}) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/options/history');
            const data = await res.json();
            if (data.success) {
                setHistory(data.history || []);
            }
        } catch {
            // Silent fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    if (history.length === 0 && !loading) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="px-3 py-3 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-300 hover:border-gray-500 transition-colors flex items-center gap-2"
            >
                📁 History
                {history.length > 0 && (
                    <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
                        {history.length}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute top-full mt-1 right-0 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-40 min-w-[280px] max-h-[400px] overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
                        Cached Scans
                    </div>
                    {loading ? (
                        <div className="px-4 py-3 text-sm text-gray-500">Loading...</div>
                    ) : history.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No cached scans</div>
                    ) : (
                        history.map((h, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    onSelect(h.date, h.symbol);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center justify-between border-t border-gray-800 first:border-t-0"
                            >
                                <div>
                                    <span className="text-sm font-mono text-white">{h.symbol}</span>
                                    <span className="text-xs text-gray-500 ml-2">{h.date}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                                        {h.strategySuggestion?.replace('_', ' ')}
                                    </span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function OptionsPage() {
    const [symbol, setSymbol] = useState('');
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<ScanResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | undefined>();
    const [selectedContract, setSelectedContract] = useState<OptionContract | null>(null);
    const [showJournalModal, setShowJournalModal] = useState(false);

    const doScan = useCallback(async (sym: string, force: boolean = false) => {
        if (!sym.trim()) return;

        setScanning(true);
        setError(null);
        setErrorCode(undefined);
        setResult(null);
        setSelectedContract(null);

        try {
            const url = `/api/options/scan?symbol=${sym.trim().toUpperCase()}${force ? '&force=true' : ''}`;
            const res = await fetch(url);
            const data: ScanResponse = await res.json();

            if (!data.success) {
                setError(data.error || 'Scan failed');
                setErrorCode(data.errorCode);
            } else {
                setResult(data);
                setSymbol(data.symbol || sym);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
            setErrorCode('FETCH_ERROR');
        } finally {
            setScanning(false);
        }
    }, []);

    const handleScan = () => doScan(symbol, false);
    const handleForceScan = () => doScan(symbol, true);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleScan();
    };

    const handleHistorySelect = async (date: string, sym: string) => {
        setSymbol(sym);
        setScanning(true);
        setError(null);
        setErrorCode(undefined);
        setResult(null);
        setSelectedContract(null);

        try {
            // Load from cache (just hit the scan API — it will return cache)
            const res = await fetch(`/api/options/scan?symbol=${sym}`);
            const data: ScanResponse = await res.json();

            if (data.success) {
                setResult(data);
            } else {
                setError(data.error || 'Failed to load cached scan');
                setErrorCode(data.errorCode);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setScanning(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">📊 Options Scanner</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            IV rank analysis, expected move, and strategy suggestions
                        </p>
                    </div>
                    <HistoryDropdown onSelect={handleHistorySelect} />
                </div>

                {/* Search Bar */}
                <div className="flex gap-3 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <input
                            type="text"
                            value={symbol}
                            onChange={e => setSymbol(e.target.value.toUpperCase())}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter ticker (e.g. AAPL)"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono text-lg"
                            maxLength={6}
                        />
                    </div>
                    <button
                        onClick={handleScan}
                        disabled={scanning || !symbol.trim()}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
                    >
                        {scanning ? '⏳ Scanning...' : '🔍 Scan'}
                    </button>
                    {result && (
                        <button
                            onClick={handleForceScan}
                            disabled={scanning}
                            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 rounded-lg transition-colors text-sm"
                            title="Bypass cache and rescan live"
                        >
                            🔄 Rescan
                        </button>
                    )}
                </div>

                {/* Cache indicator */}
                {result?.fromCache && (
                    <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
                            📁 Cached
                        </span>
                        <span>Loaded from cache · click Rescan to fetch live data</span>
                    </div>
                )}

                {/* Error */}
                {error && <ErrorDisplay error={error} errorCode={errorCode} />}

                {/* Results */}
                {result && result.success && (
                    <div className="space-y-6">
                        {/* Summary Cards Row */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {/* Underlying Price */}
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Underlying</div>
                                <div className="text-2xl font-mono font-bold text-white">
                                    ${result.underlyingPrice?.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">{result.symbol}</div>
                            </div>

                            {/* IV Rank */}
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">IV Rank</div>
                                <div className="mt-1">
                                    {result.ivRank && <IVRankBadge ivRank={result.ivRank} />}
                                </div>
                                <div className="text-[10px] text-gray-600 mt-2">
                                    {result.ivRank?.lowData ? 'Insufficient history' : 'vs. 1-year range'}
                                </div>
                            </div>

                            {/* Expected Move */}
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Expected Move</div>
                                <div className="text-lg font-mono font-semibold text-white">
                                    ±${result.expectedMove?.expectedMove.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1">
                                    ${result.expectedMove?.expectedRange.low.toFixed(2)} – ${result.expectedMove?.expectedRange.high.toFixed(2)}
                                </div>
                            </div>

                            {/* Liquidity Score */}
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Liquidity</div>
                                <div className="mt-2">
                                    <LiquidityMeter score={result.liquidityScore || 0} />
                                </div>
                                <div className="text-[10px] text-gray-600 mt-1">
                                    {result.contracts?.length} of {result.totalContractsScanned} passed
                                </div>
                            </div>

                            {/* Strategy */}
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Suggested Strategy</div>
                                <div className="mt-1">
                                    {result.strategySuggestion && (
                                        <StrategyBadge strategy={result.strategySuggestion} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Rationale */}
                        {result.rationale && (
                            <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Analysis Rationale</div>
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    {result.rationale}
                                </p>
                            </div>
                        )}

                        {/* Action Bar: Save to Journal */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowJournalModal(true)}
                                className="px-4 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                📝 Save to Journal
                            </button>
                            {selectedContract && (
                                <span className="text-xs text-gray-400">
                                    Selected: {selectedContract.type} ${selectedContract.strike} {selectedContract.expiration}
                                </span>
                            )}
                        </div>

                        {/* Contracts Table */}
                        {result.contracts && result.contracts.length > 0 && (
                            <ContractsTable
                                contracts={result.contracts}
                                selectedContract={selectedContract}
                                onSelect={setSelectedContract}
                            />
                        )}

                        {result.contracts && result.contracts.length === 0 && (
                            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 text-center">
                                <div className="text-gray-500 text-sm">
                                    No contracts passed liquidity filters.
                                    Try lowering the minimum open interest or volume thresholds.
                                </div>
                            </div>
                        )}

                        {/* Scan Metadata */}
                        <div className="text-xs text-gray-600 text-right">
                            Scanned at {result.scannedAt ? new Date(result.scannedAt).toLocaleString() : '—'} · {result.totalContractsScanned} contracts evaluated
                            {result.fromCache && ' · from cache'}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!result && !error && !scanning && (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">📊</div>
                        <h2 className="text-xl font-semibold text-gray-400 mb-2">Options Scanner</h2>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">
                            Enter a ticker symbol above and click Scan to analyze options chain,
                            evaluate implied volatility rank, and get strategy suggestions.
                        </p>
                    </div>
                )}

                {/* Journal Modal */}
                {showJournalModal && result && (
                    <JournalModal
                        result={result}
                        selectedContract={selectedContract}
                        onClose={() => setShowJournalModal(false)}
                    />
                )}
            </div>
        </div>
    );
}
