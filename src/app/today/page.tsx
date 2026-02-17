'use client';

/**
 * Today Dashboard — /today
 *
 * Unified view ranking symbols by overall opportunity strength.
 * Cross-references premarket gap signals + options scan results.
 *
 * Features:
 * - Ranked cards with score bars
 * - Color-coded alignment badges
 * - Top 5 highlighted opportunities
 * - Quick links to full scanner pages
 * - Reasoning breakdown per opportunity
 */

import { useState, useCallback, useEffect } from 'react';

// =============================================================================
// Types (mirrors API response)
// =============================================================================

type Alignment = 'ALIGNED' | 'PARTIAL' | 'CONFLICT' | 'NONE';

interface Opportunity {
    symbol: string;
    overallScore: number;
    alignment: Alignment;
    reasoning: string[];
    journalStatus?: string | null;
    journalPnl?: number | null;
    premarket: {
        direction: 'UP' | 'DOWN';
        gapPct: number;
        playType: string;
        confidence: string;
        hitRate: number;
        sampleSize: number;
    } | null;
    options: {
        strategySuggestion: string;
        ivRankValue: number | null;
        ivRankClassification: string | null;
        expectedMove: number;
        liquidityScore: number;
        underlyingPrice: number;
    } | null;
}

interface APIResponse {
    success: boolean;
    date?: string;
    opportunities?: Opportunity[];
    count?: number;
    sources?: {
        premarketCandidates: number;
        optionsScans: number;
    };
    freshness?: {
        premarketScanTimestamp: string | null;
        optionsScanTimestamps: Record<string, string>;
        missingOptions: string[];
    };
    error?: string;
}

interface MorningRunResult {
    success: boolean;
    date: string;
    premarket: { candidateCount: number; resolved: { mode: string; effectiveDate: string; reason?: string }; fromCache: boolean };
    options: { requested: number; completed: number; fromCacheCount: number; errors: Array<{ symbol: string; messagePreview?: string }> };
    today: { opportunityCount: number };
    runId: string;
    generatedAt: string;
    autoJournalResult?: { created: number; skipped: number };
    error?: string;
}

interface RunHistoryEntry {
    date: string;
    runId: string;
    candidateCount: number;
    optionsCompleted: number;
    opportunityCount: number;
    generatedAt: string;
}

function JournalStatusBadge({ status, pnl }: { status?: string | null; pnl?: number | null }) {
    if (!status) return null;
    const map: Record<string, string> = {
        PLANNED: 'bg-blue-900/40 text-blue-400 border border-blue-700/40',
        OPEN: 'bg-blue-900/40 text-blue-400 border border-blue-700/40',
        ENTERED: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40',
        EXITED: pnl != null && pnl >= 0 ? 'bg-green-900/40 text-green-400 border border-green-700/40' : 'bg-red-900/40 text-red-400 border border-red-700/40',
    };
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${map[status] || 'text-gray-500'}`}>
            {status}{pnl != null ? ` $${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : ''}
        </span>
    );
}

// =============================================================================
// Alignment Badge
// =============================================================================

function AlignmentBadge({ alignment }: { alignment: Alignment }) {
    const config: Record<Alignment, { bg: string; border: string; text: string; icon: string; label: string }> = {
        ALIGNED: { bg: 'bg-green-500/15', border: 'border-green-500/30', text: 'text-green-400', icon: '✅', label: 'Aligned' },
        PARTIAL: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '⚡', label: 'Partial' },
        CONFLICT: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', icon: '⚠️', label: 'Conflict' },
        NONE: { bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400', icon: '—', label: 'No Data' },
    };

    const c = config[alignment];

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${c.bg} ${c.border} ${c.text}`}>
            {c.icon} {c.label}
        </span>
    );
}

// =============================================================================
// Score Bar
// =============================================================================

function ScoreBar({ score }: { score: number }) {
    const color = score >= 70 ? 'bg-green-500'
        : score >= 40 ? 'bg-yellow-500'
            : score >= 20 ? 'bg-orange-500'
                : 'bg-red-500';

    return (
        <div className="flex items-center gap-2">
            <div className="w-28 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className="text-sm font-mono font-semibold text-white min-w-[36px]">{score}</span>
        </div>
    );
}

// =============================================================================
// Opportunity Card
// =============================================================================

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank: number }) {
    const [expanded, setExpanded] = useState(false);
    const isTopFive = rank <= 5;

    return (
        <div
            className={`rounded-xl border transition-all duration-200 ${isTopFive
                ? 'bg-gradient-to-br from-gray-800/60 to-gray-900/80 border-blue-500/20 shadow-lg shadow-blue-500/5'
                : 'bg-gray-800/30 border-gray-700/50'
                }`}
        >
            <div className="p-5">
                {/* Top row: rank, symbol, score, alignment */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono w-6 h-6 flex items-center justify-center rounded-full ${isTopFive ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-700 text-gray-500'
                            }`}>
                            {rank}
                        </span>
                        <h3 className="text-lg font-bold font-mono text-white">{opp.symbol}</h3>
                        <AlignmentBadge alignment={opp.alignment} />
                        <JournalStatusBadge status={opp.journalStatus} pnl={opp.journalPnl} />
                    </div>
                    <ScoreBar score={opp.overallScore} />
                </div>

                {/* Signal summary row */}
                <div className="grid grid-cols-2 gap-4 mb-3">
                    {/* Premarket */}
                    <div className="bg-gray-900/40 rounded-lg p-3 border border-gray-700/30">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Premarket</div>
                        {opp.premarket ? (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${opp.premarket.direction === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
                                        {opp.premarket.direction === 'UP' ? '↑' : '↓'} {Math.abs(opp.premarket.gapPct).toFixed(1)}%
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${opp.premarket.playType === 'CONTINUATION'
                                        ? 'bg-green-500/20 text-green-400'
                                        : opp.premarket.playType === 'FADE'
                                            ? 'bg-orange-500/20 text-orange-400'
                                            : 'bg-gray-600/30 text-gray-400'
                                        }`}>
                                        {opp.premarket.playType}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    {opp.premarket.confidence} · {opp.premarket.hitRate.toFixed(0)}% hit · {opp.premarket.sampleSize} analogs
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600">No premarket scan</div>
                        )}
                    </div>

                    {/* Options */}
                    <div className="bg-gray-900/40 rounded-lg p-3 border border-gray-700/30">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Options</div>
                        {opp.options ? (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-blue-400">
                                        {opp.options.strategySuggestion.replace('_', ' ')}
                                    </span>
                                    {opp.options.ivRankClassification && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${opp.options.ivRankClassification === 'HIGH'
                                            ? 'bg-red-500/20 text-red-400'
                                            : opp.options.ivRankClassification === 'LOW'
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'bg-yellow-500/20 text-yellow-400'
                                            }`}>
                                            IV: {opp.options.ivRankClassification}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">
                                    ${opp.options.underlyingPrice.toFixed(2)} · ±${opp.options.expectedMove.toFixed(2)} · Liq: {opp.options.liquidityScore}/100
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600">No options scan</div>
                        )}
                    </div>
                </div>

                {/* Quick links + expand */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <a
                            href={`/premarket`}
                            className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors"
                        >
                            → Premarket Scanner
                        </a>
                        <span className="text-gray-700">|</span>
                        <a
                            href={`/options`}
                            className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors"
                        >
                            → Options Scanner
                        </a>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        {expanded ? '▲ Hide reasoning' : '▼ Show reasoning'}
                    </button>
                </div>

                {/* Expanded reasoning */}
                {expanded && (
                    <div className="mt-3 pt-3 border-t border-gray-700/30">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Scoring Breakdown</div>
                        <ul className="space-y-1">
                            {opp.reasoning.map((r, i) => (
                                <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                                    <span className="text-gray-600 mt-0.5">•</span>
                                    {r}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// Main Page
// =============================================================================

export default function TodayPage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<APIResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Morning Run state
    const [mrRunning, setMrRunning] = useState(false);
    const [mrPreferLive, setMrPreferLive] = useState(false);
    const [mrMaxSymbols, setMrMaxSymbols] = useState(12);
    const [mrForce, setMrForce] = useState(false);
    const [mrResult, setMrResult] = useState<MorningRunResult | null>(null);
    const [mrError, setMrError] = useState<string | null>(null);
    const [mrAutoJournal, setMrAutoJournal] = useState(true);
    const [mrThreshold, setMrThreshold] = useState(70);
    const [mrHistory, setMrHistory] = useState<RunHistoryEntry[]>([]);
    const [mrHistoryOpen, setMrHistoryOpen] = useState(false);
    const [mrSuccess, setMrSuccess] = useState(false);

    // Risk state
    interface RiskState {
        realizedPnl: number;
        unrealizedPnl: number;
        totalPnl: number;
        openPositions: number;
        dailyLossLimitBreached: boolean;
        dailyProfitTargetHit: boolean;
        config: {
            dailyMaxLoss: number;
            dailyProfitTarget: number;
            perTradeMaxRisk: number;
            maxOpenPositions: number;
        };
    }
    const [riskState, setRiskState] = useState<RiskState | null>(null);
    const [riskLoading, setRiskLoading] = useState(false);

    const loadOpportunities = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/today/opportunities');
            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'Failed to load opportunities');
            } else {
                setData(json);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadRiskState = useCallback(async () => {
        setRiskLoading(true);
        try {
            const res = await fetch('/api/today/risk-state');
            const json = await res.json();
            if (json.success) {
                setRiskState(json as RiskState);
            }
        } catch {
            // Risk is best-effort
        } finally {
            setRiskLoading(false);
        }
    }, []);

    useEffect(() => { loadRiskState(); }, [loadRiskState]);

    const runMorning = useCallback(async () => {
        setMrRunning(true);
        setMrError(null);
        setMrResult(null);
        setMrSuccess(false);
        try {
            const res = await fetch('/api/morning-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preferLive: mrPreferLive,
                    maxSymbols: mrMaxSymbols,
                    force: mrForce,
                    autoJournal: mrAutoJournal,
                    autoJournalScoreThreshold: mrThreshold,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setMrError(json.error || 'Morning run failed');
            } else {
                setMrResult(json as MorningRunResult);
                setMrSuccess(true);
                setTimeout(() => setMrSuccess(false), 5000);
                // Auto-refresh opportunities
                loadOpportunities();
            }
        } catch (err) {
            setMrError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setMrRunning(false);
        }
    }, [mrPreferLive, mrMaxSymbols, mrForce, mrAutoJournal, mrThreshold, loadOpportunities]);

    const loadHistory = useCallback(async () => {
        try {
            const res = await fetch('/api/morning-run/history');
            const json = await res.json();
            if (json.success) {
                setMrHistory(json.runs || []);
                setMrHistoryOpen(true);
            }
        } catch {
            // History is best-effort
        }
    }, []);

    const opportunities = data?.opportunities || [];
    const topFive = opportunities.slice(0, 5);
    const rest = opportunities.slice(5);

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">📋 Today&apos;s Opportunities</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Unified ranking: Premarket gaps + Options analysis
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {data && (
                            <div className="text-xs text-gray-500 text-right">
                                <div>{data.date}</div>
                                <div>{data.sources?.premarketCandidates ?? 0} premarket · {data.sources?.optionsScans ?? 0} options</div>
                            </div>
                        )}
                        <button
                            onClick={loadOpportunities}
                            disabled={loading}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors text-sm"
                        >
                            {loading ? '⏳ Loading...' : '🔄 Load Opportunities'}
                        </button>
                    </div>
                </div>

                {/* Morning Run Panel */}

                {/* Risk Control Panel */}
                <div className={`border rounded-lg p-5 mb-6 ${riskState?.dailyLossLimitBreached
                    ? 'bg-red-950/60 border-red-700/60'
                    : riskState?.dailyProfitTargetHit
                        ? 'bg-green-950/40 border-green-700/40'
                        : 'bg-gray-800/50 border-gray-700'
                    }`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🛡️</span>
                            <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Risk Control</h2>
                            {riskState?.dailyLossLimitBreached && (
                                <span className="text-xs px-2 py-0.5 rounded bg-red-600/30 text-red-400 border border-red-600/40 font-semibold animate-pulse">LOCKED</span>
                            )}
                            {riskState?.dailyProfitTargetHit && (
                                <span className="text-xs px-2 py-0.5 rounded bg-green-600/30 text-green-400 border border-green-600/40 font-semibold">TARGET HIT</span>
                            )}
                        </div>
                        <button
                            onClick={loadRiskState}
                            disabled={riskLoading}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            {riskLoading ? '⏳' : '🔄'} Refresh
                        </button>
                    </div>

                    {riskState?.dailyLossLimitBreached && (
                        <div className="bg-red-900/40 border border-red-700/50 rounded-lg p-3 mb-4">
                            <div className="flex items-start gap-2">
                                <span className="text-lg">🚨</span>
                                <div>
                                    <div className="font-semibold text-red-400 text-sm">Trading Locked — Daily Loss Limit Reached</div>
                                    <p className="text-red-400/70 text-xs mt-1">
                                        Auto-journal and new position creation are blocked. Total PnL: ${riskState.totalPnl.toFixed(0)} | Limit: -${riskState.config.dailyMaxLoss}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {riskState && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* Realized PnL */}
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Realized P&L</div>
                                <div className={`text-lg font-mono font-bold ${riskState.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${riskState.realizedPnl >= 0 ? '+' : ''}{riskState.realizedPnl.toFixed(0)}
                                </div>
                            </div>
                            {/* Unrealized PnL */}
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Unrealized P&L</div>
                                <div className={`text-lg font-mono font-bold ${riskState.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${riskState.unrealizedPnl >= 0 ? '+' : ''}{riskState.unrealizedPnl.toFixed(0)}
                                </div>
                            </div>
                            {/* Total PnL */}
                            <div className={`rounded-lg p-3 border ${riskState.totalPnl <= -(riskState.config.dailyMaxLoss * 0.8)
                                ? 'bg-red-900/30 border-red-700/40'
                                : riskState.totalPnl >= riskState.config.dailyProfitTarget * 0.8
                                    ? 'bg-green-900/30 border-green-700/40'
                                    : 'bg-gray-900/50 border-gray-700/30'
                                }`}>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total P&L</div>
                                <div className={`text-lg font-mono font-bold ${riskState.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${riskState.totalPnl >= 0 ? '+' : ''}{riskState.totalPnl.toFixed(0)}
                                </div>
                                <div className="text-[10px] text-gray-600 mt-1">Limit: -${riskState.config.dailyMaxLoss} / +${riskState.config.dailyProfitTarget}</div>
                            </div>
                            {/* Open Positions */}
                            <div className={`rounded-lg p-3 border ${riskState.openPositions >= riskState.config.maxOpenPositions
                                ? 'bg-red-900/30 border-red-700/40'
                                : riskState.openPositions >= riskState.config.maxOpenPositions * 0.8
                                    ? 'bg-yellow-900/30 border-yellow-700/40'
                                    : 'bg-gray-900/50 border-gray-700/30'
                                }`}>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Open Positions</div>
                                <div className="text-lg font-mono font-bold text-white">
                                    {riskState.openPositions}
                                    <span className="text-xs text-gray-500 ml-1">/ {riskState.config.maxOpenPositions}</span>
                                </div>
                                <div className="text-[10px] text-gray-600 mt-1">Per-trade max: ${riskState.config.perTradeMaxRisk}</div>
                            </div>
                        </div>
                    )}

                    {!riskState && !riskLoading && (
                        <div className="text-xs text-gray-600">Click refresh to load risk state</div>
                    )}
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-5 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-lg">🌅</span>
                        <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Morning Run (All)</h2>
                    </div>
                    <div className="flex flex-wrap items-end gap-4 mb-4">
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={mrPreferLive}
                                onChange={e => setMrPreferLive(e.target.checked)}
                                className="accent-blue-500"
                            />
                            Prefer Live
                        </label>
                        <label className="text-xs text-gray-400">
                            Max Symbols
                            <input
                                type="number"
                                min={1} max={30}
                                value={mrMaxSymbols}
                                onChange={e => setMrMaxSymbols(Math.max(1, Math.min(30, parseInt(e.target.value) || 12)))}
                                className="ml-2 w-14 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={mrForce}
                                onChange={e => setMrForce(e.target.checked)}
                                className="accent-amber-500"
                            />
                            Force (bypass cache)
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={mrAutoJournal}
                                onChange={e => setMrAutoJournal(e.target.checked)}
                                className="accent-green-500"
                            />
                            Auto-Create Plans
                        </label>
                        {mrAutoJournal && (
                            <label className="text-xs text-gray-400">
                                Threshold
                                <input
                                    type="range"
                                    min={30} max={95} step={5}
                                    value={mrThreshold}
                                    onChange={e => setMrThreshold(parseInt(e.target.value))}
                                    className="ml-2 w-20 accent-green-500"
                                />
                                <span className="ml-1 font-mono text-green-400">{mrThreshold}</span>
                            </label>
                        )}
                        <button
                            onClick={runMorning}
                            disabled={mrRunning}
                            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-all text-sm shadow-lg"
                        >
                            {mrRunning ? '⏳ Running...' : mrAutoJournal ? '🚀 Run Morning Scan + Create Plans' : '🚀 Run Morning Scan'}
                        </button>
                        <button
                            onClick={loadHistory}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                        >
                            📋 History
                        </button>
                    </div>

                    {/* Run Result */}
                    {mrResult && (
                        <div className="bg-gray-900/50 border border-gray-700 rounded p-3 space-y-2">
                            <div className="flex flex-wrap gap-4 text-xs">
                                <span className="text-green-400">✅ Premarket: {mrResult.premarket.candidateCount} candidates</span>
                                <span className="text-blue-400">📊 Options: {mrResult.options.completed}/{mrResult.options.requested} scanned ({mrResult.options.fromCacheCount} cached)</span>
                                <span className="text-purple-400">🏆 Opportunities: {mrResult.today.opportunityCount}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
                                <span>Mode: {mrResult.premarket.resolved.mode}</span>
                                <span>Run ID: {mrResult.runId}</span>
                                <span>{new Date(mrResult.generatedAt).toLocaleTimeString()}</span>
                            </div>
                            {mrResult.options.errors.length > 0 && (
                                <div className="text-[10px] text-amber-400 space-y-0.5">
                                    {mrResult.options.errors.slice(0, 5).map((e, i) => (
                                        <div key={i}>⚠ {e.symbol}: {e.messagePreview?.slice(0, 80) || 'unknown error'}</div>
                                    ))}
                                    {mrResult.options.errors.length > 5 && <div>+{mrResult.options.errors.length - 5} more errors</div>}
                                </div>
                            )}
                        </div>
                    )}
                    {mrError && <div className="text-xs text-red-400 mt-2">❌ {mrError}</div>}
                    {mrSuccess && (
                        <div className="mt-2 px-3 py-2 bg-green-900/30 border border-green-700/40 rounded text-xs text-green-400">
                            ✅ Morning run complete! Opportunities refreshed.
                            {mrResult?.autoJournalResult && (
                                <span className="ml-2">
                                    📝 Plans created: {mrResult.autoJournalResult.created}, skipped: {mrResult.autoJournalResult.skipped}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Run History */}
                    {mrHistoryOpen && mrHistory.length > 0 && (
                        <div className="mt-3 bg-gray-900/50 border border-gray-700 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-400">📋 Run History</span>
                                <button onClick={() => setMrHistoryOpen(false)} className="text-[10px] text-gray-600 hover:text-gray-400">✖</button>
                            </div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {mrHistory.slice(0, 20).map(run => (
                                    <div key={run.runId} className="flex items-center justify-between text-[11px] text-gray-400 bg-gray-800/50 rounded px-2 py-1">
                                        <span className="font-mono">{run.date}</span>
                                        <span>{run.candidateCount} pm · {run.optionsCompleted} opt · {run.opportunityCount} opp</span>
                                        <span className="text-gray-600">{new Date(run.generatedAt).toLocaleTimeString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Data Freshness */}
                {data?.freshness && (
                    <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mb-6">
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">📊 Data Freshness</div>
                        <div className="flex flex-wrap gap-3 items-start">
                            {/* Premarket scan timestamp */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-500 uppercase">Premarket Scan:</span>
                                {data.freshness.premarketScanTimestamp ? (
                                    <span className="px-2 py-0.5 text-xs rounded bg-green-500/15 border border-green-500/30 text-green-400 font-mono">
                                        {new Date(data.freshness.premarketScanTimestamp).toLocaleTimeString()}
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-500">none</span>
                                )}
                            </div>

                            {/* Options scan timestamps (show for symbols in opportunities, capped at 8) */}
                            {Object.entries(data.freshness.optionsScanTimestamps).slice(0, 8).map(([sym, ts]) => (
                                <div key={sym} className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500 font-mono">{sym}:</span>
                                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono">
                                        {new Date(ts).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                            {Object.keys(data.freshness.optionsScanTimestamps).length > 8 && (
                                <span className="text-[10px] text-gray-600">+{Object.keys(data.freshness.optionsScanTimestamps).length - 8} more</span>
                            )}

                            {/* OPTIONS MISSING badges */}
                            {data.freshness.missingOptions.map(sym => (
                                <span key={sym} className="px-2 py-0.5 text-[10px] rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono font-medium">
                                    {sym} — OPTIONS MISSING
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="rounded-lg p-4 mb-6 border bg-red-900/30 border-red-700 text-red-400">
                        <p className="text-sm">❌ {error}</p>
                    </div>
                )}

                {/* Empty State */}
                {!data && !error && !loading && (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">📋</div>
                        <h2 className="text-xl font-semibold text-gray-400 mb-2">Today&apos;s Dashboard</h2>
                        <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                            Click &quot;Load Opportunities&quot; to cross-reference today&apos;s premarket gaps
                            with options scans and rank by overall opportunity strength.
                        </p>
                        <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
                            <a href="/premarket" className="hover:text-blue-400 transition-colors">→ Run Premarket Scanner first</a>
                            <span>|</span>
                            <a href="/options" className="hover:text-blue-400 transition-colors">→ Run Options Scanner first</a>
                        </div>
                    </div>
                )}

                {/* No results */}
                {data && opportunities.length === 0 && (
                    <div className="text-center py-16">
                        <div className="text-4xl mb-3">📭</div>
                        <h2 className="text-lg font-semibold text-gray-400 mb-2">No opportunities found</h2>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">
                            Run the Premarket Scanner and/or Options Scanner first to generate data for today.
                        </p>
                    </div>
                )}

                {/* Results */}
                {data && opportunities.length > 0 && (
                    <div className="space-y-8">
                        {/* Top 5 Section */}
                        {topFive.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <h2 className="text-lg font-semibold text-white">🏆 Top Opportunities</h2>
                                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                                        Top {topFive.length}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {topFive.map((opp, i) => (
                                        <OpportunityCard key={opp.symbol} opp={opp} rank={i + 1} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Remaining */}
                        {rest.length > 0 && (
                            <div>
                                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                                    Other Opportunities ({rest.length})
                                </h2>
                                <div className="space-y-2">
                                    {rest.map((opp, i) => (
                                        <OpportunityCard key={opp.symbol} opp={opp} rank={i + 6} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className="flex items-center gap-4 text-xs text-gray-600 pt-4 border-t border-gray-800">
                            <span>Alignment:</span>
                            <span className="text-green-500">✅ Aligned</span>
                            <span className="text-yellow-500">⚡ Partial</span>
                            <span className="text-red-500">⚠️ Conflict</span>
                            <span className="text-gray-500">— None</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
