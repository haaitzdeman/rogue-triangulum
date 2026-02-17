'use client';

/**
 * Premarket Gap Scanner Control Panel
 * 
 * Full control panel with settings, history, and journal integration.
 * No PowerShell required - all actions available in-app.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// =============================================================================
// Types
// =============================================================================

interface KeyLevels {
    prevClose: number;
    gapReferencePrice: number;
    premarketHigh?: number;
    premarketLow?: number;
}

interface AnalogStats {
    sampleSize: number;
    hitRate: number;
    avgMFE: number;
    avgMAE: number;
    continuationPct: number;
    regimeTag: string;
}

interface GapCandidate {
    symbol: string;
    gapPct: number;
    direction: 'UP' | 'DOWN';
    playType: 'CONTINUATION' | 'FADE' | 'AVOID';
    confidence: 'HIGH' | 'LOW';
    lowConfidence: boolean;
    dataMode: 'PREMARKET' | 'OPEN_FALLBACK';
    because: string;
    keyLevels: KeyLevels;
    invalidation: string;
    riskNote: string;
    analogStats: AnalogStats;
}

interface ResolvedInfo {
    requestedDate: string | null;
    effectiveDate: string;
    mode: 'DATASET_REPLAY' | 'LIVE_PREMARKET';
    reason: string;
    datasetRange: { firstDate: string; lastDate: string };
}

interface ConfigUsed {
    scannerConfig: {
        minAbsGapPct: number;
        minPrice: number;
        minAvgDailyVolume20: number;
        excludeETFs: boolean;
    };
    analogConfig: {
        gapBandPct: number;
        minSampleSize: number;
        holdDays: number;
        rDefinition: number;
    };
    clamp: boolean;
    preferLive: boolean;
}

interface CoverageSummary {
    symbolsWithPrevClose: number;
    symbolsWithOpen: number;
    symbolsWithPremarketPrice: number;
}

interface ScanResult {
    success: boolean;
    date: string;
    universeCount: number;
    candidateCount: number;
    dataModeSummary: { PREMARKET: number; OPEN_FALLBACK: number };
    candidates: GapCandidate[];
    generatedAt: string;
    resolved?: ResolvedInfo;
    configUsed?: ConfigUsed;
    inputCoverageSummary?: CoverageSummary;
    providerErrors?: Array<{ status: string; messagePreview?: string }>;
}

interface ApiError {
    success: false;
    errorCode: string;
    message?: string;
    errors?: Array<{ field: string; message: string }>;
}

interface HistoryEntry {
    date: string;
    candidateCount: number;
    generatedAt: string;
    mode: string;
    effectiveDate: string;
}

// =============================================================================
// Settings State
// =============================================================================

interface ScanSettings {
    minAbsGapPct: number;
    minPrice: number;
    minAvgDailyVolume20: number;
    excludeETFs: boolean;
    gapBandPct: number;
    minSampleSize: number;
    holdDays: number;
    preferLive: boolean;
    clamp: boolean;
}

const DEFAULT_SETTINGS: ScanSettings = {
    minAbsGapPct: 3,
    minPrice: 5,
    minAvgDailyVolume20: 1000000,
    excludeETFs: true,
    gapBandPct: 1,
    minSampleSize: 30,
    holdDays: 1,
    preferLive: false,
    clamp: true,
};

// =============================================================================
// Components
// =============================================================================

function PlayTypeBadge({ playType }: { playType: string }) {
    const colors: Record<string, string> = {
        CONTINUATION: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        FADE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        AVOID: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${colors[playType] || 'bg-gray-600'}`}>
            {playType}
        </span>
    );
}

function ConfidenceBadge({ confidence, lowConfidence }: { confidence: string; lowConfidence: boolean }) {
    if (lowConfidence) {
        return (
            <span className="px-2 py-0.5 text-xs font-medium rounded border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                LOW CONF
            </span>
        );
    }
    return (
        <span className="px-2 py-0.5 text-xs font-medium rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
            {confidence}
        </span>
    );
}

function DataModeBadge({ mode }: { mode: string }) {
    const isPremarket = mode === 'PREMARKET';
    return (
        <span className={`px-2 py-0.5 text-xs rounded border ${isPremarket
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
            }`}>
            {isPremarket ? 'PM' : 'OPEN'}
        </span>
    );
}

function ModeBadge({ mode }: { mode: string }) {
    const isLive = mode === 'LIVE_PREMARKET';
    return (
        <span className={`px-3 py-1 text-sm font-semibold rounded-lg ${isLive
            ? 'bg-green-600 text-white'
            : 'bg-blue-600 text-white'
            }`}>
            {isLive ? '🔴 LIVE PREMARKET' : '📂 DATASET REPLAY'}
        </span>
    );
}

// Key Levels Card for Scanner Detail View
function KeyLevelsCardSimple({ keyLevels, invalidation }: { keyLevels: KeyLevels; invalidation?: string }) {
    const fmt = (n?: number) => n !== undefined ? `$${n.toFixed(2)}` : null;

    // Build level data - only show levels that have values
    const levels: Array<{ label: string; value: string; helper: string; color: string }> = [];

    if (keyLevels.prevClose !== undefined) {
        levels.push({
            label: 'Prev Close',
            value: fmt(keyLevels.prevClose)!,
            helper: 'reference',
            color: 'text-gray-300'
        });
    }
    if (keyLevels.gapReferencePrice !== undefined) {
        levels.push({
            label: 'Gap Reference',
            value: fmt(keyLevels.gapReferencePrice)!,
            helper: 'gap calc',
            color: 'text-blue-400'
        });
    }
    if (keyLevels.premarketHigh !== undefined) {
        levels.push({
            label: 'PM High',
            value: fmt(keyLevels.premarketHigh)!,
            helper: 'range',
            color: 'text-green-400'
        });
    }
    if (keyLevels.premarketLow !== undefined) {
        levels.push({
            label: 'PM Low',
            value: fmt(keyLevels.premarketLow)!,
            helper: 'range',
            color: 'text-red-400'
        });
    }

    // Parse invalidation for stop price if present
    const invalidationText = invalidation || '';

    return (
        <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-400 mb-2">📊 Key Levels</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {levels.map((level, i) => (
                    <div key={i} className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{level.label}</div>
                        <div className={`text-base font-mono font-semibold ${level.color}`}>{level.value}</div>
                        <div className="text-[9px] text-gray-600">{level.helper}</div>
                    </div>
                ))}
            </div>
            {invalidationText && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Invalidation / Stop</div>
                    <div className="text-xs text-amber-400 mt-0.5">{invalidationText}</div>
                </div>
            )}
        </div>
    );
}

function SettingsPanel({
    settings,
    onChange,
    isCollapsed,
    onToggle,
}: {
    settings: ScanSettings;
    onChange: (s: ScanSettings) => void;
    isCollapsed: boolean;
    onToggle: () => void;
}) {
    const handleChange = (key: keyof ScanSettings, value: number | boolean) => {
        onChange({ ...settings, [key]: value });
    };

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
            >
                <span className="font-semibold text-gray-200">⚙️ Control Panel</span>
                <span className="text-gray-400">{isCollapsed ? '▼' : '▲'}</span>
            </button>

            {!isCollapsed && (
                <div className="p-4 border-t border-gray-700 space-y-4">
                    {/* Scanner Config */}
                    <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Gap Scanner</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Min Gap %</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    value={settings.minAbsGapPct}
                                    onChange={e => handleChange('minAbsGapPct', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Min Price</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={settings.minPrice}
                                    onChange={e => handleChange('minPrice', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Min Avg Volume</label>
                                <input
                                    type="number"
                                    step="100000"
                                    value={settings.minAvgDailyVolume20}
                                    onChange={e => handleChange('minAvgDailyVolume20', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.excludeETFs}
                                        onChange={e => handleChange('excludeETFs', e.target.checked)}
                                        className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-gray-300">Exclude ETFs</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Analog Config */}
                    <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Analog Engine</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Gap Band %</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={settings.gapBandPct}
                                    onChange={e => handleChange('gapBandPct', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Min Sample Size</label>
                                <input
                                    type="number"
                                    step="5"
                                    value={settings.minSampleSize}
                                    onChange={e => handleChange('minSampleSize', parseInt(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Hold Days</label>
                                <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    max="30"
                                    value={settings.holdDays}
                                    onChange={e => handleChange('holdDays', parseInt(e.target.value) || 1)}
                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Mode Toggles */}
                    <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.preferLive}
                                onChange={e => handleChange('preferLive', e.target.checked)}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-gray-300">Prefer Live</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.clamp}
                                onChange={e => handleChange('clamp', e.target.checked)}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-gray-300">Clamp Out-of-Range</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

function CandidateRow({
    candidate,
    isExpanded,
    onToggle,
    onSaveToJournal,
    isSaving,
}: {
    candidate: GapCandidate;
    isExpanded: boolean;
    onToggle: () => void;
    onSaveToJournal: () => void;
    isSaving: boolean;
}) {
    return (
        <>
            <tr
                className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={onToggle}
            >
                <td className="px-4 py-3 font-mono font-semibold text-blue-400">
                    {candidate.symbol}
                </td>
                <td className={`px-4 py-3 font-mono ${candidate.gapPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {candidate.gapPct >= 0 ? '+' : ''}{candidate.gapPct.toFixed(2)}%
                </td>
                <td className="px-4 py-3">
                    <PlayTypeBadge playType={candidate.playType} />
                </td>
                <td className="px-4 py-3">
                    <ConfidenceBadge confidence={candidate.confidence} lowConfidence={candidate.lowConfidence} />
                </td>
                <td className="px-4 py-3 text-gray-400 text-sm">
                    n={candidate.analogStats.sampleSize}
                </td>
                <td className="px-4 py-3">
                    <DataModeBadge mode={candidate.dataMode} />
                </td>
                <td className="px-4 py-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); onSaveToJournal(); }}
                        disabled={isSaving}
                        className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded transition-colors"
                    >
                        {isSaving ? '...' : '📓 Save'}
                    </button>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-gray-900/50">
                    <td colSpan={7} className="px-4 py-4">
                        <div className="space-y-4">
                            {/* Key Levels Card - Full Width */}
                            <KeyLevelsCardSimple keyLevels={candidate.keyLevels} invalidation={candidate.invalidation} />

                            {/* Calculation Detail */}
                            {(() => {
                                const pc = candidate.keyLevels.prevClose;
                                const rp = candidate.keyLevels.gapReferencePrice;
                                const computed = pc && rp ? Math.round(((rp - pc) / pc) * 100 * 100) / 100 : null;
                                const mismatch = computed !== null && Math.abs(computed - candidate.gapPct) > 0.005;
                                return (
                                    <div className="bg-gray-800/60 border border-gray-700 rounded p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-medium text-gray-300">Calculation Detail</span>
                                            <DataModeBadge mode={candidate.dataMode} />
                                            {mismatch && (
                                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 border border-red-500/30">MISMATCH</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                                            <div>
                                                <div className="text-gray-500">prevClose</div>
                                                <div className="text-gray-300">{pc != null ? `$${pc.toFixed(2)}` : '—'}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">referencePrice</div>
                                                <div className="text-cyan-400">{rp != null ? `$${rp.toFixed(2)}` : '—'}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">formula</div>
                                                <div className="text-gray-400">(ref − prev) / prev × 100</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">result</div>
                                                <div className={`font-bold ${candidate.gapPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {computed !== null ? `${computed >= 0 ? '+' : ''}${computed.toFixed(2)}%` : '—'}
                                                    {mismatch && <span className="text-red-400 ml-1">(displayed: {candidate.gapPct.toFixed(2)}%)</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Signal Details */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div className="md:col-span-2">
                                    <div className="font-medium text-gray-300 mb-1">Because</div>
                                    <div className="text-gray-400">{candidate.because}</div>
                                </div>
                                <div>
                                    <div className="font-medium text-gray-300 mb-1">Risk Note</div>
                                    <div className="text-yellow-400">{candidate.riskNote}</div>
                                </div>
                            </div>

                            {/* Analog Stats */}
                            <div>
                                <div className="font-medium text-gray-300 mb-1 text-sm">Analog Stats</div>
                                <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-400">
                                    <span>hitRate: {(candidate.analogStats.hitRate * 100).toFixed(1)}%</span>
                                    <span>avgMFE: {candidate.analogStats.avgMFE.toFixed(2)}%</span>
                                    <span>avgMAE: {candidate.analogStats.avgMAE.toFixed(2)}%</span>
                                    <span>continuation: {(candidate.analogStats.continuationPct * 100).toFixed(1)}%</span>
                                    <span>regime: {candidate.analogStats.regimeTag}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function ErrorPanel({ error }: { error: ApiError }) {
    return (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <div className="font-semibold text-red-400 mb-2">
                ❌ Error: {error.errorCode}
            </div>
            {error.message && (
                <div className="text-red-300 text-sm mb-2">{error.message}</div>
            )}
            {error.errors && error.errors.length > 0 && (
                <ul className="text-red-300 text-sm list-disc list-inside">
                    {error.errors.map((e, i) => (
                        <li key={i}><code>{e.field}</code>: {e.message}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CoverageSummaryPanel({ coverage, providerErrors }: {
    coverage?: CoverageSummary;
    providerErrors?: Array<{ status: string; messagePreview?: string }>;
}) {
    if (!coverage) return null;

    return (
        <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">📊 Coverage Summary</div>
            <div className="flex flex-wrap gap-4 text-xs font-mono">
                <span className="text-gray-300">prevClose: {coverage.symbolsWithPrevClose}</span>
                <span className="text-gray-300">open: {coverage.symbolsWithOpen}</span>
                <span className={coverage.symbolsWithPremarketPrice > 0 ? 'text-green-400' : 'text-gray-500'}>
                    premarketPrice: {coverage.symbolsWithPremarketPrice}
                </span>
            </div>
            {providerErrors && providerErrors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="text-xs text-amber-400">
                        ⚠️ Provider errors ({providerErrors.length}):
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        {providerErrors.slice(0, 3).map((e, i) => (
                            <div key={i}>{e.status}{e.messagePreview ? `: ${e.messagePreview.slice(0, 50)}...` : ''}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Diagnostics Panel (for live provider debugging without PowerShell)
// =============================================================================

interface DiagnosticsData {
    provider: {
        effectiveProvider: string;
        effectiveBaseUrl: string;
        hasMassiveKey: boolean;
        hasPolygonKey: boolean;
        liveConfigured: boolean;
        isPremarketHours: boolean;
        isMarketHours: boolean;
        currentTimeET: string;
    };
    coverage: {
        universeCount: number;
        sampleCount: number;
        symbolsWithPrevClose: number;
        symbolsWithPremarketPrice: number;
        symbolsWithOpen: number;
        symbolsWithLivePrice: number;
        coverageSufficient: boolean;
    };
    providerErrors: Array<{ provider: string; status: string; messagePreview?: string }>;
    detailedSnapshots: Array<{
        symbol: string;
        rawFields: {
            prevDayClose: number | null;
            dayOpen: number | null;
            lastTradePrice: number | null;
            lastTradeTimestamp: number | null;
            minClose: number | null;
            askPrice: number | null;
            bidPrice: number | null;
        };
        computed: {
            premarketPrice: number | null;
            premarketPriceSource: string;
            livePrice: number | null;
            livePriceSource: string | null;
            dataMode: 'PREMARKET' | 'OPEN_FALLBACK';
            isPremarketHours: boolean;
        };
        error?: { provider: string; status: string; messagePreview?: string };
    }>;
    lastUpdated: string;
}

function DiagnosticsPanel() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DiagnosticsData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Live Run state
    const [liveRunLoading, setLiveRunLoading] = useState(false);
    const [liveRunResult, setLiveRunResult] = useState<{
        resolved: { mode: string; resolvedDate: string; reason: string };
        candidateCount: number;
        candidates: Array<{ symbol: string; gapPct: number; direction: string; dataMode?: string; prevClose?: number; gapReferencePrice?: number }>;
        inputCoverageSummary?: { symbolsWithPremarketPrice: number; totalSymbols: number };
    } | null>(null);
    const [liveRunError, setLiveRunError] = useState<string | null>(null);

    const runLiveScan = async () => {
        setLiveRunLoading(true);
        setLiveRunError(null);
        try {
            const params = new URLSearchParams({
                preferLive: 'true',
                force: 'true',  // Force fresh scan
            });
            const res = await fetch(`/api/premarket/gaps?${params}`);
            const json = await res.json();

            if (!res.ok || !json.success) {
                setLiveRunError(json.message || json.errorCode || 'Scan failed');
                return;
            }

            setLiveRunResult({
                resolved: { mode: json.resolved?.mode, resolvedDate: json.resolved?.resolvedDate ?? json.resolved?.effectiveDate, reason: json.resolved?.reason ?? '' },
                candidateCount: json.candidates?.length ?? 0,
                candidates: (json.candidates || []).slice(0, 10).map((c: { symbol: string; gapPct: number; direction: string; dataMode?: string; prevClose?: number; gapReferencePrice?: number }) => ({
                    symbol: c.symbol,
                    gapPct: c.gapPct,
                    direction: c.direction,
                    dataMode: c.dataMode,
                    prevClose: c.prevClose,
                    gapReferencePrice: c.gapReferencePrice,
                })),
                inputCoverageSummary: json.inputCoverageSummary,
            });
        } catch (err) {
            setLiveRunError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLiveRunLoading(false);
        }
    };

    const fetchDiagnostics = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/dev/premarket-live-diagnostics');
            if (res.status === 404) {
                setError('Diagnostics unavailable (production mode)');
                return;
            }
            const json = await res.json();
            // API returns error field if something went wrong
            if (json.error) {
                setError(json.message || json.error);
            } else {
                setData(json);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = () => {
        const newExpanded = !isExpanded;
        setIsExpanded(newExpanded);
        if (newExpanded && !data && !loading) {
            fetchDiagnostics();
        }
    };

    return (
        <div className="bg-gray-800/30 border border-gray-700 rounded-lg overflow-hidden mt-4">
            <button
                onClick={handleToggle}
                className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-700/30 transition-colors text-sm"
            >
                <span className="text-gray-400">🔧 Diagnostics</span>
                <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
                <div className="p-4 border-t border-gray-700 text-sm">
                    {loading && <div className="text-gray-500">⏳ Loading diagnostics...</div>}

                    {error && (
                        <div className="text-amber-400">⚠️ {error}</div>
                    )}

                    {data && (
                        <div className="space-y-3">
                            {/* Provider Info */}
                            <div>
                                <span className="text-gray-500">Provider: </span>
                                <code className="text-gray-300 bg-gray-900 px-2 py-0.5 rounded text-xs">
                                    {data.provider.effectiveProvider}
                                </code>
                                {data.provider.liveConfigured && (
                                    <span className="ml-2 text-green-400 text-xs">✅ configured</span>
                                )}
                            </div>

                            {/* Base URL */}
                            <div>
                                <span className="text-gray-500">Base URL: </span>
                                <code className="text-gray-300 bg-gray-900 px-2 py-0.5 rounded text-xs">
                                    {data.provider.effectiveBaseUrl}
                                </code>
                            </div>

                            {/* Market Hours */}
                            <div className="flex gap-4 text-xs">
                                <div>
                                    <span className="text-gray-500">Premarket: </span>
                                    <span className={data.provider.isPremarketHours ? 'text-green-400' : 'text-gray-400'}>
                                        {data.provider.isPremarketHours ? '✅ Yes' : '❌ No'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Market Hours: </span>
                                    <span className={data.provider.isMarketHours ? 'text-green-400' : 'text-gray-400'}>
                                        {data.provider.isMarketHours ? '✅ Yes' : '❌ No'}
                                    </span>
                                </div>
                                <div className="text-gray-500">
                                    ET: {data.provider.currentTimeET}
                                </div>
                            </div>

                            {/* Coverage Summary */}
                            <div>
                                <div className="text-gray-500 mb-1">Coverage (sample of {data.coverage.sampleCount}/{data.coverage.universeCount}):</div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
                                    <div className="text-gray-400">
                                        PrevClose: <span className="text-gray-300">{data.coverage.symbolsWithPrevClose}</span>
                                    </div>
                                    <div className="text-gray-400">
                                        Open: <span className="text-gray-300">{data.coverage.symbolsWithOpen}</span>
                                    </div>
                                    <div className={data.coverage.symbolsWithPremarketPrice > 0 ? 'text-green-400' : 'text-gray-400'}>
                                        PM Price: <span className="text-gray-300">{data.coverage.symbolsWithPremarketPrice}</span>
                                    </div>
                                    <div className={(data.coverage.symbolsWithLivePrice ?? 0) > 0 ? 'text-cyan-400' : 'text-gray-400'}>
                                        LivePrice: <span className="text-gray-300">{data.coverage.symbolsWithLivePrice ?? 0}</span>
                                    </div>
                                    <div className={data.coverage.coverageSufficient ? 'text-green-400' : 'text-amber-400'}>
                                        {data.coverage.coverageSufficient ? '✅ Sufficient' : '⚠️ Low'}
                                    </div>
                                </div>
                            </div>

                            {/* Provider Errors */}
                            {data.providerErrors.length > 0 && (
                                <div>
                                    <div className="text-amber-400 mb-1">
                                        ⚠️ Provider Errors ({data.providerErrors.length}):
                                    </div>
                                    <div className="text-xs text-gray-400 space-y-1 max-h-24 overflow-y-auto">
                                        {data.providerErrors.slice(0, 5).map((e, i) => (
                                            <div key={i} className="font-mono">
                                                {e.status}
                                                {e.messagePreview && ` - ${e.messagePreview.slice(0, 30)}...`}
                                            </div>
                                        ))}
                                        {data.providerErrors.length > 5 && (
                                            <div className="text-gray-500">
                                                ... and {data.providerErrors.length - 5} more
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Detailed Snapshots (shows raw Polygon fields) */}
                            {data.detailedSnapshots && data.detailedSnapshots.length > 0 && (
                                <div>
                                    <div className="text-gray-500 mb-2">📊 Field-Level Diagnostics:</div>
                                    <div className="text-xs font-mono space-y-2 max-h-64 overflow-y-auto">
                                        {data.detailedSnapshots.map((s, i) => (
                                            <div key={i} className="bg-gray-900/50 rounded p-2 border border-gray-700">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-white font-bold">{s.symbol}</span>
                                                    <span className={s.computed.dataMode === 'PREMARKET' ? 'text-green-400' : 'text-gray-500'}>
                                                        [{s.computed.dataMode}]
                                                    </span>
                                                    {s.error && (
                                                        <span className="text-red-400 text-2xs">❌ {s.error.status}</span>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-400">
                                                    <div>
                                                        prevDayClose: <span className="text-gray-300">${s.rawFields.prevDayClose?.toFixed(2) ?? '—'}</span>
                                                    </div>
                                                    <div>
                                                        dayOpen: <span className="text-gray-300">${s.rawFields.dayOpen?.toFixed(2) ?? '—'}</span>
                                                    </div>
                                                    <div>
                                                        lastTradePrice: <span className={s.rawFields.lastTradePrice ? 'text-green-300' : 'text-gray-500'}>${s.rawFields.lastTradePrice?.toFixed(2) ?? '—'}</span>
                                                    </div>
                                                    <div>
                                                        minClose: <span className="text-gray-300">${s.rawFields.minClose?.toFixed(2) ?? '—'}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-1 pt-1 border-t border-gray-700">
                                                    <span className="text-gray-500">premarketPrice: </span>
                                                    <span className={s.computed.premarketPrice !== null ? 'text-green-400 font-bold' : 'text-red-400'}>
                                                        {s.computed.premarketPrice !== null ? `$${s.computed.premarketPrice.toFixed(2)}` : 'null'}
                                                    </span>
                                                    <span className="text-gray-600 ml-2">
                                                        (source: {s.computed.premarketPriceSource})
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">livePrice: </span>
                                                    <span className={s.computed.livePrice !== null ? 'text-cyan-400 font-bold' : 'text-gray-500'}>
                                                        {s.computed.livePrice !== null ? `$${s.computed.livePrice.toFixed(2)}` : '—'}
                                                    </span>
                                                    <span className="text-gray-600 ml-2">
                                                        (source: {s.computed.livePriceSource ?? '—'})
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Last Updated + Refresh */}
                            <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                                {data.lastUpdated && (
                                    <span className="text-gray-500 text-xs">
                                        ✓ Updated: {new Date(data.lastUpdated).toLocaleTimeString()}
                                    </span>
                                )}
                                <button
                                    onClick={fetchDiagnostics}
                                    disabled={loading}
                                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-xs rounded transition-colors"
                                >
                                    🔄 Refresh Diagnostics
                                </button>
                            </div>

                            {/* Live Run Section */}
                            <div className="pt-3 mt-3 border-t border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-gray-400 font-medium">🚀 Live Run Test</span>
                                    <button
                                        onClick={runLiveScan}
                                        disabled={liveRunLoading}
                                        className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white text-sm font-medium rounded transition-colors"
                                    >
                                        {liveRunLoading ? '⏳ Running...' : '▶️ Live Run (preferLive=true)'}
                                    </button>
                                </div>

                                {liveRunError && (
                                    <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded p-2 mb-2">
                                        ❌ {liveRunError}
                                    </div>
                                )}

                                {liveRunResult && (
                                    <div className="bg-gray-900/50 rounded p-3 text-xs font-mono space-y-2">
                                        {/* Resolved Mode */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">resolved.mode:</span>
                                            <span className={liveRunResult.resolved.mode === 'LIVE_PREMARKET' ? 'text-green-400 font-bold' : 'text-amber-400'}>
                                                {liveRunResult.resolved.mode}
                                            </span>
                                        </div>
                                        {liveRunResult.resolved.reason && (
                                            <div className="flex items-start gap-2">
                                                <span className="text-gray-500">reason:</span>
                                                <span className="text-gray-400 text-[11px]">{liveRunResult.resolved.reason}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">resolvedDate:</span>
                                            <span className="text-gray-300">{liveRunResult.resolved.resolvedDate}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">candidateCount:</span>
                                            <span className="text-gray-300">{liveRunResult.candidateCount}</span>
                                        </div>

                                        {/* Input Coverage Summary */}
                                        {liveRunResult.inputCoverageSummary && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500">inputCoverageSummary:</span>
                                                <span className={liveRunResult.inputCoverageSummary.symbolsWithPremarketPrice > 0 ? 'text-green-400' : 'text-amber-400'}>
                                                    {liveRunResult.inputCoverageSummary.symbolsWithPremarketPrice}/{liveRunResult.inputCoverageSummary.totalSymbols} with PM Price
                                                </span>
                                            </div>
                                        )}

                                        {/* Top 10 Candidates */}
                                        {liveRunResult.candidates.length > 0 && (
                                            <div>
                                                <div className="text-gray-500 mb-1">Top {liveRunResult.candidates.length} Candidates:</div>
                                                <div className="space-y-1">
                                                    {liveRunResult.candidates.map((c, i) => (
                                                        <div key={i} className="flex items-center gap-3 flex-wrap">
                                                            <span className="text-white w-12 text-right">{c.symbol}</span>
                                                            <span className={c.direction === 'UP' ? 'text-green-400' : 'text-red-400'}>
                                                                {c.gapPct > 0 ? '+' : ''}{c.gapPct.toFixed(1)}%
                                                            </span>
                                                            <span className={c.dataMode === 'PREMARKET' ? 'text-green-500' : 'text-gray-500'}>
                                                                [{c.dataMode || '?'}]
                                                            </span>
                                                            {c.prevClose != null && (
                                                                <span className="text-gray-500">prev: ${c.prevClose.toFixed(2)}</span>
                                                            )}
                                                            {c.gapReferencePrice != null && (
                                                                <span className="text-cyan-400">ref: ${c.gapReferencePrice.toFixed(2)}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function PremarketPage() {
    const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
    const [settingsCollapsed, setSettingsCollapsed] = useState(true);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [savingSymbol, setSavingSymbol] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [dateInput, setDateInput] = useState<string>('');

    // Load history on mount
    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/premarket/history');
            const data = await res.json();
            if (data.success && data.history) {
                setHistory(data.history);
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        }
    };

    const buildQueryString = useCallback((date?: string, force = false): string => {
        const params = new URLSearchParams();
        if (date) params.set('date', date);
        if (force) params.set('force', 'true');
        params.set('minAbsGapPct', settings.minAbsGapPct.toString());
        params.set('minPrice', settings.minPrice.toString());
        params.set('minAvgDailyVolume20', settings.minAvgDailyVolume20.toString());
        params.set('excludeETFs', settings.excludeETFs.toString());
        params.set('gapBandPct', settings.gapBandPct.toString());
        params.set('minSampleSize', settings.minSampleSize.toString());
        params.set('holdDays', settings.holdDays.toString());
        params.set('preferLive', settings.preferLive.toString());
        params.set('clamp', settings.clamp.toString());
        return params.toString();
    }, [settings]);

    const runScan = async (date?: string, force = false) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQueryString(date, force);
            const res = await fetch(`/api/premarket/gaps?${query}`);
            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data as ApiError);
                setResult(null);
            } else {
                setResult(data as ScanResult);
                fetchHistory(); // Refresh history after run
            }
        } catch (err) {
            setError({
                success: false,
                errorCode: 'NETWORK_ERROR',
                message: err instanceof Error ? err.message : 'Network error',
            });
        } finally {
            setLoading(false);
        }
    };

    const loadFromHistory = async (date: string) => {
        setSelectedDate(date);
        // Load the saved file directly (just run scan which will use cache)
        await runScan(date);
    };

    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDateInput(e.target.value);
    };

    const handleRunClick = () => {
        runScan(dateInput || undefined, true);
    };

    const saveToJournal = async (candidate: GapCandidate) => {
        if (!result) return;

        setSavingSymbol(candidate.symbol);
        try {
            const payload = {
                effectiveDate: result.resolved?.effectiveDate ?? result.date,
                symbol: candidate.symbol,
                gapPct: candidate.gapPct,
                direction: candidate.direction,
                playType: candidate.playType,
                confidence: candidate.confidence,
                lowConfidence: candidate.lowConfidence,
                because: candidate.because,
                keyLevels: candidate.keyLevels,
                invalidation: candidate.invalidation,
                riskNote: candidate.riskNote,
                analogStats: candidate.analogStats,
                scanGeneratedAt: result.generatedAt,
                configUsed: result.configUsed ?? {},
            };

            const res = await fetch('/api/premarket/journal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.success) {
                alert(`✅ Saved ${candidate.symbol} to journal!`);
            } else {
                alert(`❌ Failed to save: ${data.message}`);
            }
        } catch (err) {
            alert(`❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setSavingSymbol(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">📊 Premarket Gap Scanner</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Ranked candidates with analog evaluation
                        </p>
                    </div>
                    <Link
                        href="/premarket/journal"
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-center"
                    >
                        📓 View Journal
                    </Link>
                </div>

                {/* Settings Panel */}
                <SettingsPanel
                    settings={settings}
                    onChange={setSettings}
                    isCollapsed={settingsCollapsed}
                    onToggle={() => setSettingsCollapsed(!settingsCollapsed)}
                />

                {/* Diagnostics Panel (collapsed by default) */}
                <DiagnosticsPanel />

                {/* Date Selection & Run */}
                <div className="mt-4 flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Date (YYYY-MM-DD)</label>
                        <input
                            type="date"
                            value={dateInput}
                            onChange={handleDateInputChange}
                            className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-gray-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Load from History</label>
                        <select
                            value={selectedDate}
                            onChange={e => loadFromHistory(e.target.value)}
                            className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-gray-200 min-w-[200px]"
                        >
                            <option value="">Select saved date...</option>
                            {history.map(h => (
                                <option key={h.date} value={h.date}>
                                    {h.date} ({h.candidateCount} candidates)
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleRunClick}
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                    >
                        {loading ? '⏳ Running...' : '🚀 Run Scan'}
                    </button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mt-4">
                        <ErrorPanel error={error} />
                    </div>
                )}

                {/* Results */}
                {result && (
                    <div className="mt-6 space-y-4">
                        {/* Mode & Info Header */}
                        <div className="flex flex-wrap gap-4 items-center">
                            {result.resolved && (
                                <>
                                    <ModeBadge mode={result.resolved.mode} />
                                    <span className="text-gray-400 text-sm">
                                        effectiveDate: <code className="bg-gray-800 px-2 py-0.5 rounded">{result.resolved.effectiveDate}</code>
                                    </span>
                                    <span className="text-gray-500 text-xs">
                                        ({result.resolved.reason})
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Dataset Range */}
                        {result.resolved?.datasetRange && (
                            <div className="text-xs text-gray-500">
                                Dataset range: {result.resolved.datasetRange.firstDate} to {result.resolved.datasetRange.lastDate}
                            </div>
                        )}

                        {/* Coverage Summary */}
                        <CoverageSummaryPanel
                            coverage={result.inputCoverageSummary}
                            providerErrors={result.providerErrors}
                        />

                        {/* Stats */}
                        <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                                <span className="text-gray-500">Universe:</span>{' '}
                                <span className="text-gray-200">{result.universeCount}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Candidates:</span>{' '}
                                <span className="text-white font-semibold">{result.candidateCount}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Data Mode:</span>{' '}
                                <span className="text-gray-200">
                                    PM: {result.dataModeSummary?.PREMARKET ?? 0} | OPEN: {result.dataModeSummary?.OPEN_FALLBACK ?? 0}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500">Generated:</span>{' '}
                                <span className="text-gray-400 text-xs">{result.generatedAt}</span>
                            </div>
                        </div>

                        {/* Candidates Table */}
                        {result.candidateCount > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-800/50 text-gray-400 text-sm">
                                        <tr>
                                            <th className="px-4 py-3">Symbol</th>
                                            <th className="px-4 py-3">Gap%</th>
                                            <th className="px-4 py-3">Play</th>
                                            <th className="px-4 py-3">Confidence</th>
                                            <th className="px-4 py-3">Sample</th>
                                            <th className="px-4 py-3">Mode</th>
                                            <th className="px-4 py-3">Journal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.candidates.map(c => (
                                            <CandidateRow
                                                key={c.symbol}
                                                candidate={c}
                                                isExpanded={expandedRow === c.symbol}
                                                onToggle={() => setExpandedRow(expandedRow === c.symbol ? null : c.symbol)}
                                                onSaveToJournal={() => saveToJournal(c)}
                                                isSaving={savingSymbol === c.symbol}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-500">
                                No candidates found matching filters
                            </div>
                        )}

                        {/* Config Used (collapsible) */}
                        {result.configUsed && (
                            <details className="bg-gray-800/30 border border-gray-700 rounded-lg p-3">
                                <summary className="text-sm text-gray-400 cursor-pointer">
                                    📋 Config Used (click to expand)
                                </summary>
                                <pre className="mt-2 text-xs text-gray-500 overflow-auto">
                                    {JSON.stringify(result.configUsed, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                )}

                {/* Initial State */}
                {!result && !error && !loading && (
                    <div className="mt-12 text-center py-12 text-gray-500">
                        Click <span className="text-blue-400">Run Scan</span> to analyze premarket gaps
                    </div>
                )}
            </div>
        </div>
    );
}
