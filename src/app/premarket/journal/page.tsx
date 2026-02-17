'use client';

/**
 * Premarket Journal Page
 * 
 * Trader-readable interface for managing gap trade candidates with outcome tracking.
 * Features:
 * - Key Levels card with visual price map
 * - Trade details with size mode (SHARES/DOLLARS)
 * - Live outcome preview before save
 * - Optional stop loss with R calculation
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { computeStockSizing, type RiskMode } from '@/lib/shared/sizing';

// =============================================================================
// Types
// =============================================================================

interface KeyLevels {
    prevClose?: number;
    gapReferencePrice?: number;
    premarketHigh?: number;
    premarketLow?: number;
    open?: number;
    stopLoss?: number;
}

interface Outcome {
    pnlDollars?: number;
    pnlPercent?: number;
    rMultiple?: number;
    result?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING';
    notes?: string;
    brokerFill?: {
        side: string;
        qty: number;
        price: number;
        filledAt: string;
        orderId: string;
        source: string;
    };
}

interface JournalEntry {
    id: string;
    created_at: string;
    effective_date: string;
    signal_id?: string;
    symbol: string;
    gap_pct: number;
    direction: 'UP' | 'DOWN';
    play_type: 'CONTINUATION' | 'FADE' | 'AVOID';
    confidence: 'HIGH' | 'LOW';
    low_confidence: boolean;
    because: string;
    key_levels: KeyLevels;
    invalidation: string;
    risk_note: string;
    analog_stats: Record<string, unknown>;
    scan_generated_at: string;
    config_used: Record<string, unknown>;
    signal_snapshot?: Record<string, unknown>;
    user_note: string | null;
    status: string;
    trade_direction?: 'LONG' | 'SHORT';
    entry_price?: number;
    exit_price?: number;
    size?: number;
    entry_time?: string;
    exit_time?: string;
    outcome: Outcome | null;
    // Sizing fields (from Supabase)
    risk_mode?: string | null;
    risk_value?: number | null;
    account_size?: number | null;
    // Reconciliation transparency
    reconcile_status?: string | null;
    entry_fill_id?: string | null;
    exit_fill_id?: string | null;
    match_explanation?: string[] | null;
    manual_override?: boolean;
    avg_entry_price?: number | null;
    total_qty?: number | null;
    exited_qty?: number | null;
    realized_pnl_dollars?: number | null;
    // Ledger safety
    ledger_write_failed?: boolean;
}

// =============================================================================
// Badge Components
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

function StatusBadge({ status }: { status: string }) {
    const isOpen = status === 'OPEN';
    return (
        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${isOpen
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
            }`}>
            {status}
        </span>
    );
}

function ResultBadge({ result }: { result?: string }) {
    if (!result || result === 'PENDING') return <span className="text-gray-600 text-xs">—</span>;
    const badgeMap: Record<string, string> = {
        WIN: 'bg-green-900/50 text-green-400 border border-green-700/50',
        LOSS: 'bg-red-900/50 text-red-400 border border-red-700/50',
        BREAKEVEN: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50',
    };
    return (
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${badgeMap[result] || 'text-gray-400'}`}>
            {result}
        </span>
    );
}

function ReconcileStatusBadge({ status }: { status?: string | null }) {
    if (!status) return <span className="text-gray-600 text-xs">—</span>;
    const map: Record<string, string> = {
        MATCHED: 'bg-green-900/40 text-green-400 border border-green-700/40',
        PARTIAL: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40',
        AMBIGUOUS: 'bg-orange-900/40 text-orange-400 border border-orange-700/40',
        AMBIGUOUS_REVERSAL: 'bg-red-900/50 text-red-400 border border-red-600/50',
        BLOCKED_MANUAL_OVERRIDE: 'bg-blue-900/40 text-blue-400 border border-blue-700/40',
        NONE: 'bg-gray-800/60 text-gray-500 border border-gray-700/40',
    };
    const labelMap: Record<string, string> = {
        BLOCKED_MANUAL_OVERRIDE: 'MANUAL',
        AMBIGUOUS_REVERSAL: 'REVERSAL',
    };
    const label = labelMap[status] || status;
    return (
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[status] || 'text-gray-400'}`}>
            {label}
        </span>
    );
}

// Data Mode Badge for journal table
function DataModeBadge({ mode }: { mode: string }) {
    const isPremarket = mode === 'PREMARKET';
    return (
        <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${isPremarket
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
            title={isPremarket ? 'True premarket snapshot used' : 'No premarket snapshot; gap used market open price'}
        >
            {isPremarket ? 'PREMARKET' : 'OPEN FALLBACK'}
        </span>
    );
}

// Source Badge for journal entries (PREMARKET_SIGNAL vs BROKER_IMPORT)
function LinkedSourceBadge({ entry }: { entry: JournalEntry }) {
    const configUsed = entry.config_used as Record<string, unknown> | undefined;
    const isBrokerImport = configUsed?.source === 'BROKER_IMPORT';
    const outcome = entry.outcome as Record<string, unknown> | undefined;
    const hasBrokerFill = !!outcome?.brokerFill;

    if (isBrokerImport) {
        return (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded border bg-violet-500/20 text-violet-400 border-violet-500/30"
                title="Imported from broker sync">
                BROKER
            </span>
        );
    }
    if (hasBrokerFill) {
        return (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded border bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                title="Linked to broker fill">
                LINKED
            </span>
        );
    }
    return (
        <span className="px-2 py-0.5 text-[10px] font-medium rounded border bg-gray-500/20 text-gray-500 border-gray-500/30">
            SIGNAL
        </span>
    );
}

// =============================================================================
// Broker Sync Panel
// =============================================================================

function BrokerSyncPanel() {
    const [syncSince, setSyncSince] = useState('');
    const [syncUntil, setSyncUntil] = useState('');
    const [dryRun, setDryRun] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{
        success: boolean;
        fetchedCount: number;
        mappedCount: number;
        insertedCount: number;
        skippedCount: number;
        linkedCount: number;
        rangeUsed: { since: string; until: string };
        samplePreview: Array<{
            symbol: string;
            side: string;
            qty: number;
            price: number;
            filledAt: string;
            assetClass: string;
        }>;
        lastSyncedAt: string;
        errorCode?: string;
        error?: string;
    } | null>(null);
    const [envStatus, setEnvStatus] = useState<{
        hasKey: boolean;
        hasSecret: boolean;
        baseUrl: string;
    } | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        fetch('/api/dev/broker-env')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) {
                    setEnvStatus({
                        hasKey: data.hasALPACA_API_KEY,
                        hasSecret: data.hasALPACA_API_SECRET,
                        baseUrl: data.effectiveBaseUrl,
                    });
                }
            })
            .catch(() => {/* ignore */ });
    }, []);

    const handleSync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        setShowPreview(false);
        try {
            const res = await fetch('/api/broker/alpaca/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    since: syncSince || undefined,
                    until: syncUntil || undefined,
                    dryRun,
                }),
            });
            const data = await res.json();
            setSyncResult(data);
            if (data.samplePreview?.length > 0) setShowPreview(true);
        } catch (err) {
            setSyncResult({
                success: false,
                fetchedCount: 0,
                mappedCount: 0,
                insertedCount: 0,
                skippedCount: 0,
                linkedCount: 0,
                rangeUsed: { since: syncSince, until: syncUntil },
                samplePreview: [],
                lastSyncedAt: new Date().toISOString(),
                error: err instanceof Error ? err.message : 'Network error',
            });
        } finally {
            setSyncing(false);
        }
    }, [syncSince, syncUntil, dryRun]);

    const configured = envStatus?.hasKey && envStatus?.hasSecret;
    const isPaper = envStatus?.baseUrl?.includes('paper');
    const isLiveBlocked = envStatus && !isPaper;

    // Extract masked domain for display (no path, no secrets)
    const maskedDomain = envStatus?.baseUrl
        ? (() => { try { return new URL(envStatus.baseUrl).hostname; } catch { return envStatus.baseUrl; } })()
        : '—';

    return (
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 mb-6">
            <div className="flex items-center flex-wrap gap-2 mb-3">
                <span className="text-lg">🔗</span>
                <h3 className="font-semibold text-gray-200">Broker Sync</h3>
                {envStatus && (
                    <span className={`px-2 py-0.5 text-[10px] rounded ${configured
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                        }`}>
                        {configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                    </span>
                )}
                {isPaper && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-400">
                        PAPER ONLY
                    </span>
                )}
                {isLiveBlocked && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400">
                        ⚠ LIVE_DISABLED
                    </span>
                )}
                <span className="text-[10px] text-gray-600 ml-auto font-mono">
                    {maskedDomain}
                </span>
            </div>

            {isLiveBlocked && (
                <div className="text-xs text-red-400 mb-3 bg-red-900/20 border border-red-800/30 rounded p-2">
                    ⚠ ALPACA_BASE_URL points to a live endpoint. Only <code>paper-api.alpaca.markets</code> is allowed. Sync is blocked.
                </div>
            )}

            {!configured && envStatus && !isLiveBlocked && (
                <div className="text-xs text-gray-500 mb-3">
                    Set ALPACA_API_KEY and ALPACA_API_SECRET in .env.local to enable sync.
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Since</label>
                    <input
                        type="date"
                        value={syncSince}
                        onChange={e => setSyncSince(e.target.value)}
                        className="px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Until</label>
                    <input
                        type="date"
                        value={syncUntil}
                        onChange={e => setSyncUntil(e.target.value)}
                        className="px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                    />
                </div>
                <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={e => setDryRun(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-900"
                    />
                    Dry Run
                </label>
                <button
                    onClick={handleSync}
                    disabled={syncing || !configured || !!isLiveBlocked}
                    className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
                >
                    {syncing ? '⏳ Syncing...' : dryRun ? '🔍 Dry Run' : '🔄 Sync Fills'}
                </button>
            </div>

            {/* Results */}
            {syncResult && (
                <div className={`mt-3 p-3 rounded text-sm ${syncResult.success
                    ? 'bg-green-900/20 border border-green-700/50 text-green-300'
                    : 'bg-red-900/20 border border-red-700/50 text-red-300'
                    }`}>
                    {syncResult.success ? (
                        <div>
                            <div className="flex flex-wrap gap-4 items-center">
                                <span>✅ {dryRun ? 'Dry run' : 'Sync'} complete</span>
                                <span className="text-gray-500 text-xs">
                                    {syncResult.rangeUsed.since} → {syncResult.rangeUsed.until}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-lg font-mono text-blue-400">{syncResult.fetchedCount}</div>
                                    <div className="text-[10px] text-gray-500">Fetched</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-lg font-mono text-purple-400">{syncResult.mappedCount}</div>
                                    <div className="text-[10px] text-gray-500">Mapped</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-lg font-mono text-green-400">{syncResult.insertedCount}</div>
                                    <div className="text-[10px] text-gray-500">Inserted</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-lg font-mono text-gray-400">{syncResult.skippedCount}</div>
                                    <div className="text-[10px] text-gray-500">Skipped</div>
                                </div>
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-lg font-mono text-cyan-400">{syncResult.linkedCount}</div>
                                    <div className="text-[10px] text-gray-500">Linked</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-600 mt-2">
                                Last synced: {new Date(syncResult.lastSyncedAt).toLocaleString()}
                            </div>

                            {/* Sample Preview */}
                            {syncResult.samplePreview?.length > 0 && (
                                <div className="mt-2">
                                    <button
                                        onClick={() => setShowPreview(!showPreview)}
                                        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                                    >
                                        {showPreview ? '▼' : '▶'} Preview ({syncResult.samplePreview.length} fills)
                                    </button>
                                    {showPreview && (
                                        <div className="mt-1 overflow-x-auto">
                                            <table className="w-full text-xs text-left">
                                                <thead className="text-gray-500">
                                                    <tr>
                                                        <th className="px-2 py-1">Symbol</th>
                                                        <th className="px-2 py-1">Side</th>
                                                        <th className="px-2 py-1">Qty</th>
                                                        <th className="px-2 py-1">Price</th>
                                                        <th className="px-2 py-1">Type</th>
                                                        <th className="px-2 py-1">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {syncResult.samplePreview.map((fill, i) => (
                                                        <tr key={i} className="border-t border-gray-800">
                                                            <td className="px-2 py-1 font-mono text-blue-400">{fill.symbol}</td>
                                                            <td className={`px-2 py-1 ${fill.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                                                                {fill.side.toUpperCase()}
                                                            </td>
                                                            <td className="px-2 py-1 font-mono">{fill.qty}</td>
                                                            <td className="px-2 py-1 font-mono">${fill.price.toFixed(2)}</td>
                                                            <td className="px-2 py-1 text-gray-500">{fill.assetClass}</td>
                                                            <td className="px-2 py-1 text-gray-500">
                                                                {new Date(fill.filledAt).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div>❌ {syncResult.errorCode === 'LIVE_DISABLED' ? '🔒 ' : ''}{syncResult.error?.slice(0, 200)}</div>
                            {syncResult.errorCode && (
                                <div className="text-xs text-gray-500 mt-1">Code: {syncResult.errorCode}</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Key Levels Card with Price Map
// =============================================================================

function KeyLevelsCard({ levels, entryPrice }: { levels: KeyLevels; entryPrice?: number }) {
    // Format price to 2 decimals
    const fmt = (n?: number) => n !== undefined ? `$${n.toFixed(2)}` : '—';

    // Calculate range for price map
    const allPrices = [
        levels.prevClose,
        levels.gapReferencePrice,
        levels.premarketHigh,
        levels.premarketLow,
        levels.open,
        entryPrice,
    ].filter((p): p is number => p !== undefined && p > 0);

    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
    const range = maxPrice - minPrice || 1;

    // Calculate position as percentage
    const getPos = (price?: number) => {
        if (price === undefined) return null;
        return ((price - minPrice) / range) * 100;
    };

    const prevClosePos = getPos(levels.prevClose);
    const gapRefPos = getPos(levels.gapReferencePrice);
    const pmHighPos = getPos(levels.premarketHigh);
    const pmLowPos = getPos(levels.premarketLow);
    const entryPos = getPos(entryPrice);

    return (
        <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-300 mb-3">📊 Key Levels</h4>

            {/* Price Rows */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
                <div className="flex justify-between">
                    <span className="text-gray-500">Prev Close</span>
                    <span className="text-gray-300 font-mono">{fmt(levels.prevClose)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">Gap Ref</span>
                    <span className="text-blue-400 font-mono">{fmt(levels.gapReferencePrice)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">PM High</span>
                    <span className="text-green-400 font-mono">{fmt(levels.premarketHigh)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">PM Low</span>
                    <span className="text-red-400 font-mono">{fmt(levels.premarketLow)}</span>
                </div>
                {levels.open !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-500">Open</span>
                        <span className="text-yellow-400 font-mono">{fmt(levels.open)}</span>
                    </div>
                )}
                {entryPrice !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-500">Your Entry</span>
                        <span className="text-purple-400 font-mono">{fmt(entryPrice)}</span>
                    </div>
                )}
            </div>

            {/* Price Map Visual */}
            {allPrices.length >= 2 && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Price Map</div>
                    <div className="relative h-6 bg-gray-900 rounded">
                        {/* Range bar (PM Low to PM High) */}
                        {pmLowPos !== null && pmHighPos !== null && (
                            <div
                                className="absolute h-full bg-gray-700 rounded"
                                style={{
                                    left: `${Math.min(pmLowPos, pmHighPos)}%`,
                                    width: `${Math.abs(pmHighPos - pmLowPos)}%`,
                                }}
                            />
                        )}

                        {/* Prev Close marker */}
                        {prevClosePos !== null && (
                            <div
                                className="absolute w-0.5 h-full bg-gray-400"
                                style={{ left: `${prevClosePos}%` }}
                                title={`Prev Close: ${fmt(levels.prevClose)}`}
                            />
                        )}

                        {/* Gap Reference marker */}
                        {gapRefPos !== null && (
                            <div
                                className="absolute w-1 h-full bg-blue-500 rounded"
                                style={{ left: `${gapRefPos}%` }}
                                title={`Gap Ref: ${fmt(levels.gapReferencePrice)}`}
                            />
                        )}

                        {/* Entry marker */}
                        {entryPos !== null && (
                            <div
                                className="absolute w-2 h-full bg-purple-500 rounded"
                                style={{ left: `${entryPos}%` }}
                                title={`Entry: ${fmt(entryPrice)}`}
                            />
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                        <span>◼ PM Range</span>
                        <span className="text-gray-400">│ Prev Close</span>
                        <span className="text-blue-400">│ Gap Ref</span>
                        {entryPrice && <span className="text-purple-400">│ Entry</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Trade Form Types and Helpers
// =============================================================================

type SizeMode = 'SHARES' | 'DOLLARS';

interface TradeFormData {
    trade_direction: 'LONG' | 'SHORT' | '';
    entry_price: string;
    exit_price: string;
    size_mode: SizeMode;
    size_value: string;
    stop_loss: string;
    execution_notes: string;
    review_notes: string;
    risk_mode: RiskMode;
    risk_value: string;
    account_size: string;
    is_draft: boolean;
}

// Notes delimiter format: [EXECUTION]...text...[REVIEW]...text...
function parseNotesDelimited(raw: string | null | undefined): { execution: string; review: string } {
    if (!raw) return { execution: '', review: '' };
    const execMatch = raw.match(/\[EXECUTION\]([\s\S]*?)(?=\[REVIEW\]|$)/);
    const revMatch = raw.match(/\[REVIEW\]([\s\S]*)$/);
    if (execMatch || revMatch) {
        return {
            execution: (execMatch?.[1] || '').trim(),
            review: (revMatch?.[1] || '').trim(),
        };
    }
    // Legacy format: treat entire text as execution notes
    return { execution: raw.trim(), review: '' };
}

function serializeNotesDelimited(execution: string, review: string): string {
    const parts: string[] = [];
    if (execution.trim()) parts.push(`[EXECUTION]\n${execution.trim()}`);
    if (review.trim()) parts.push(`[REVIEW]\n${review.trim()}`);
    return parts.join('\n');
}

function computeTradeMetrics(form: TradeFormData, keyLevels: KeyLevels) {
    const entry = parseFloat(form.entry_price) || 0;
    const exit = parseFloat(form.exit_price) || 0;
    const sizeValue = parseFloat(form.size_value) || 0;
    const stopLoss = parseFloat(form.stop_loss) || keyLevels.stopLoss || 0;
    const direction = form.trade_direction;

    if (!entry || !sizeValue || !direction) {
        return null;
    }

    // Calculate shares and position value
    let shares = 0;
    let positionValue = 0;
    if (form.size_mode === 'SHARES') {
        shares = sizeValue;
        positionValue = shares * entry;
    } else {
        positionValue = sizeValue;
        shares = sizeValue / entry;
    }

    // Calculate P&L if exit provided
    let pnlDollars = 0;
    let pnlPercent = 0;
    if (exit > 0) {
        const priceChange = direction === 'LONG' ? exit - entry : entry - exit;
        pnlDollars = priceChange * shares;
        pnlPercent = (priceChange / entry) * 100;
    }

    // Calculate Risk and R if stop loss available
    let riskDollars: number | null = null;
    let rMultiple: number | null = null;
    if (stopLoss > 0) {
        const riskPerShare = direction === 'LONG'
            ? Math.abs(entry - stopLoss)
            : Math.abs(stopLoss - entry);
        riskDollars = riskPerShare * shares;
        if (exit > 0 && riskPerShare > 0) {
            const priceChange = direction === 'LONG' ? exit - entry : entry - exit;
            rMultiple = priceChange / riskPerShare;
        }
    }

    return {
        shares: shares.toFixed(0),
        positionValue: positionValue.toFixed(2),
        pnlDollars: pnlDollars.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2),
        riskDollars: riskDollars?.toFixed(2) ?? null,
        rMultiple: rMultiple?.toFixed(2) ?? null,
        hasExit: exit > 0,
        hasStopLoss: stopLoss > 0,
    };
}

// =============================================================================
// Entry Row Component
// =============================================================================

function EntryRow({
    entry,
    isExpanded,
    onToggle,
    onUpdateStatus,
    onUpdateTrade,
    isSaving,
}: {
    entry: JournalEntry;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdateStatus: (status: 'OPEN' | 'CLOSED') => void;
    onUpdateTrade: (updates: Record<string, unknown>) => void;
    isSaving: boolean;
}) {
    // Initialize form from entry data
    const parsedNotes = parseNotesDelimited(entry.outcome?.notes || entry.user_note);
    const [tradeForm, setTradeForm] = useState<TradeFormData>({
        trade_direction: entry.trade_direction || '',
        entry_price: entry.entry_price?.toString() || '',
        exit_price: entry.exit_price?.toString() || '',
        size_mode: 'SHARES',
        size_value: entry.size?.toString() || '',
        stop_loss: (entry.key_levels.stopLoss)?.toString() || '',
        execution_notes: parsedNotes.execution,
        review_notes: parsedNotes.review,
        risk_mode: (entry.risk_mode as RiskMode) || 'CONTRACTS',
        risk_value: entry.risk_value?.toString() || '',
        account_size: entry.account_size?.toString() || '',
        is_draft: (entry as unknown as Record<string, unknown>).is_draft as boolean ?? true,
    });

    // Compute sizing preview from risk mode
    const sizingPreview = useMemo(() => {
        const entryPrice = parseFloat(tradeForm.entry_price);
        const stopPrice = parseFloat(tradeForm.stop_loss);
        const riskValue = parseFloat(tradeForm.risk_value);
        if (!entryPrice || !stopPrice || !riskValue || tradeForm.risk_mode === 'CONTRACTS') return null;
        return computeStockSizing({
            riskMode: tradeForm.risk_mode,
            riskValue,
            entryPrice,
            stopPrice,
            accountSize: tradeForm.risk_mode === 'RISK_PERCENT' ? parseFloat(tradeForm.account_size) || undefined : undefined,
        });
    }, [tradeForm.entry_price, tradeForm.stop_loss, tradeForm.risk_value, tradeForm.risk_mode, tradeForm.account_size]);

    // Compute live metrics
    const metrics = useMemo(
        () => computeTradeMetrics(tradeForm, entry.key_levels),
        [tradeForm, entry.key_levels]
    );

    const handleSaveTrade = () => {
        const updates: Record<string, unknown> = {};
        if (tradeForm.trade_direction) updates.trade_direction = tradeForm.trade_direction;
        if (tradeForm.entry_price) updates.entry_price = parseFloat(tradeForm.entry_price);
        if (tradeForm.exit_price) updates.exit_price = parseFloat(tradeForm.exit_price);

        // Convert size based on mode
        if (tradeForm.size_value && tradeForm.entry_price) {
            const entry = parseFloat(tradeForm.entry_price);
            if (tradeForm.size_mode === 'SHARES') {
                updates.size = parseFloat(tradeForm.size_value);
            } else {
                // Convert dollars to shares
                updates.size = parseFloat(tradeForm.size_value) / entry;
            }
        }

        // Serialize notes using delimiter format
        const serializedNotes = serializeNotesDelimited(tradeForm.execution_notes, tradeForm.review_notes);
        if (serializedNotes) {
            updates.user_note = serializedNotes;
        }

        // Sizing fields
        if (tradeForm.risk_mode && tradeForm.risk_mode !== 'CONTRACTS') {
            updates.risk_mode = tradeForm.risk_mode;
            if (tradeForm.risk_value) updates.risk_value = parseFloat(tradeForm.risk_value);
            if (tradeForm.account_size) updates.account_size = parseFloat(tradeForm.account_size);
        }

        // Draft flag + stop_price for risk normalization
        updates.is_draft = tradeForm.is_draft;
        if (tradeForm.stop_loss) updates.stop_price = parseFloat(tradeForm.stop_loss);

        onUpdateTrade(updates);
    };

    const analogStats = entry.analog_stats as { sampleSize?: number; hitRate?: number; avgMFE?: number };
    const outcome = entry.outcome;

    return (
        <>
            <tr
                className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={onToggle}
            >
                <td className="px-4 py-3 font-mono font-semibold text-blue-400">
                    {entry.symbol}
                </td>
                <td className={`px-4 py-3 font-mono ${entry.gap_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {entry.gap_pct >= 0 ? '+' : ''}{entry.gap_pct.toFixed(2)}%
                </td>
                <td className="px-4 py-3">
                    <PlayTypeBadge playType={entry.play_type} />
                </td>
                <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                </td>
                <td className="px-4 py-3">
                    <LinkedSourceBadge entry={entry} />
                </td>
                <td className="px-4 py-3">
                    <DataModeBadge mode={(entry.signal_snapshot as { dataMode?: string })?.dataMode || 'OPEN_FALLBACK'} />
                </td>
                <td className="px-4 py-3">
                    {entry.trade_direction && (
                        <span className={`text-xs font-medium ${entry.trade_direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                            {entry.trade_direction}
                        </span>
                    )}
                </td>
                <td className="px-4 py-3">
                    <ResultBadge result={outcome?.result} />
                </td>
                <td className={`px-4 py-3 font-mono text-sm ${(outcome?.pnlDollars ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {outcome?.pnlDollars !== undefined ? `$${outcome.pnlDollars.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                    {/* Hide R for AVOID plays or when no stop exists */}
                    {entry.play_type !== 'AVOID' && outcome?.rMultiple !== undefined
                        ? `${outcome.rMultiple.toFixed(1)}R`
                        : entry.play_type === 'AVOID'
                            ? <span className="text-gray-600" title="R not applicable for AVOID signals">n/a</span>
                            : '—'
                    }
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-gray-900/50">
                    <td colSpan={10} className="px-4 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Left Column: Signal Details + Key Levels */}
                            <div className="lg:col-span-2 space-y-4">
                                {/* Key Levels Card */}
                                <KeyLevelsCard
                                    levels={entry.key_levels}
                                    entryPrice={parseFloat(tradeForm.entry_price) || undefined}
                                />

                                {/* Signal Details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <div className="font-medium text-gray-300 mb-1">Signal ID</div>
                                        <div className="text-gray-400 font-mono text-xs">{entry.signal_id || '—'}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-300 mb-1">Effective Date</div>
                                        <div className="text-gray-400">{entry.effective_date}</div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <div className="font-medium text-gray-300 mb-1">Because</div>
                                        <div className="text-gray-400">{entry.because}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-300 mb-1">Invalidation</div>
                                        <div className="text-gray-400">{entry.invalidation}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-300 mb-1">Risk Note</div>
                                        <div className="text-yellow-400">{entry.risk_note}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-300 mb-1">Analog Stats</div>
                                        <div className="text-xs font-mono text-gray-400">
                                            n={analogStats.sampleSize ?? '?'},
                                            hit={(((analogStats.hitRate ?? 0) * 100).toFixed(1))}%,
                                            MFE={analogStats.avgMFE?.toFixed(2) ?? '?'}%
                                        </div>
                                    </div>
                                </div>

                                {/* Linked Broker Fill */}
                                {outcome?.brokerFill && (
                                    <div className="bg-violet-900/20 border border-violet-700/40 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-sm">🔗</span>
                                            <span className="font-medium text-violet-300 text-sm">Linked Broker Fill</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                                            <div>
                                                <div className="text-gray-500">Side</div>
                                                <div className={`font-mono ${(outcome.brokerFill as Record<string, unknown>).side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {String((outcome.brokerFill as Record<string, unknown>).side ?? '').toUpperCase()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Qty</div>
                                                <div className="font-mono text-gray-200">
                                                    {String((outcome.brokerFill as Record<string, unknown>).qty ?? '—')}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Price</div>
                                                <div className="font-mono text-gray-200">
                                                    ${Number((outcome.brokerFill as Record<string, unknown>).price ?? 0).toFixed(2)}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Filled At</div>
                                                <div className="text-gray-300">
                                                    {(outcome.brokerFill as Record<string, unknown>).filledAt
                                                        ? new Date(String((outcome.brokerFill as Record<string, unknown>).filledAt)).toLocaleString()
                                                        : '—'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Order ID</div>
                                                <div className="font-mono text-gray-500 text-[10px] truncate" title={String((outcome.brokerFill as Record<string, unknown>).orderId ?? '')}>
                                                    {String((outcome.brokerFill as Record<string, unknown>).orderId ?? '—').slice(0, 12)}…
                                                </div>
                                            </div>
                                        </div>

                                        {/* Link Proof */}
                                        <div className="mt-2 pt-2 border-t border-violet-700/30">
                                            <div className="text-[10px] text-violet-400 uppercase tracking-widest mb-1.5">Link Proof</div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
                                                <div>
                                                    <div className="text-gray-500">broker_trade_id</div>
                                                    <div className="text-gray-400 truncate" title={String((outcome.brokerFill as Record<string, unknown>).orderId ?? '')}>
                                                        {String((outcome.brokerFill as Record<string, unknown>).orderId ?? '—').slice(0, 16)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">matched_symbol</div>
                                                    <div className="text-white font-bold">{entry.symbol}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">matched_date</div>
                                                    <div className="text-gray-300">{entry.effective_date}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">matched_direction</div>
                                                    <div className={`${entry.trade_direction === 'LONG' ? 'text-green-400' : entry.trade_direction === 'SHORT' ? 'text-red-400' : 'text-gray-400'}`}>
                                                        {entry.trade_direction || String((outcome.brokerFill as Record<string, unknown>).side ?? '—').toUpperCase()}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">qty / price</div>
                                                    <div className="text-gray-300">
                                                        {String((outcome.brokerFill as Record<string, unknown>).qty ?? '—')} @ ${Number((outcome.brokerFill as Record<string, unknown>).price ?? 0).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reversal Warning Banner */}
                                {entry.reconcile_status === 'AMBIGUOUS_REVERSAL' && (
                                    <div className="bg-red-950/50 border border-red-700/60 rounded-lg p-3">
                                        <div className="flex items-start gap-2">
                                            <span className="text-lg">⚠️</span>
                                            <div className="flex-1">
                                                <div className="font-medium text-red-400 text-sm">Possible Reversal Detected</div>
                                                <p className="text-red-400/80 text-xs mt-1">
                                                    Exit fills exceed entry qty — this may be a same-day flip (LONG → SHORT or vice versa).
                                                    Manual split required to separate the two trades.
                                                </p>
                                                {process.env.NEXT_PUBLIC_ADMIN_MODE === 'true' && (
                                                    <button
                                                        className="mt-2 px-3 py-1 text-[11px] bg-red-900/50 text-red-300 border border-red-700/50 rounded hover:bg-red-900/70 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const splitQty = prompt(`Original trade qty to keep (total: ${entry.total_qty || entry.size || '?'})`);
                                                            if (splitQty && parseInt(splitQty) > 0) {
                                                                fetch(`/api/premarket/journal/${entry.id}/split-trades`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ splitAtQty: parseInt(splitQty) }),
                                                                }).then(r => r.json()).then(res => {
                                                                    if (res.success) {
                                                                        alert(`Split complete. New entry: ${res.newEntryId}`);
                                                                        window.location.reload();
                                                                    } else {
                                                                        alert(`Split failed: ${res.error}`);
                                                                    }
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        ✂️ Split Into Two Trades
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reconciliation Transparency */}
                                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">⚙️</span>
                                            <span className="font-medium text-gray-300 text-sm">Reconciliation</span>
                                        </div>
                                        <ReconcileStatusBadge status={entry.reconcile_status} />
                                    </div>

                                    {/* Ledger Write Failure Warning */}
                                    {entry.ledger_write_failed && (
                                        <div className="bg-red-900/30 border border-red-600/50 rounded px-3 py-2 flex items-start gap-2">
                                            <span className="text-red-400 text-sm mt-0.5">⚠️</span>
                                            <div>
                                                <div className="text-red-400 text-xs font-semibold">LEDGER WRITE FAILED</div>
                                                <div className="text-red-400/70 text-[11px] mt-0.5">Exit computed but ledger persistence failed; accounting may be incomplete.</div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-2 text-xs">
                                        {/* Fill IDs */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <div className="text-gray-500">Entry Fill</div>
                                                <div className="font-mono text-gray-400 truncate" title={entry.entry_fill_id || ''}>
                                                    {entry.entry_fill_id ? entry.entry_fill_id.slice(0, 20) + (entry.entry_fill_id.length > 20 ? '…' : '') : '—'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Exit Fill</div>
                                                <div className="font-mono text-gray-400 truncate" title={entry.exit_fill_id || ''}>
                                                    {entry.exit_fill_id ? entry.exit_fill_id.slice(0, 20) + (entry.exit_fill_id.length > 20 ? '…' : '') : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Scale info */}
                                        {(entry.avg_entry_price || entry.total_qty || entry.exited_qty != null) && (
                                            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-700/30">
                                                <div>
                                                    <div className="text-gray-500">Avg Entry</div>
                                                    <div className="font-mono text-gray-300">${entry.avg_entry_price?.toFixed(2) ?? '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">Total Qty</div>
                                                    <div className="font-mono text-gray-300">{entry.total_qty ?? '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">Exited Qty</div>
                                                    <div className="font-mono text-gray-300">{entry.exited_qty ?? 0} / {entry.total_qty ?? '—'}</div>
                                                </div>
                                            </div>
                                        )}
                                        {entry.realized_pnl_dollars != null && (
                                            <div className="pt-1 border-t border-gray-700/30">
                                                <span className="text-gray-500">Realized PnL: </span>
                                                <span className={`font-mono font-medium ${entry.realized_pnl_dollars >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    ${entry.realized_pnl_dollars.toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                        {/* Match Explanation */}
                                        {entry.match_explanation && entry.match_explanation.length > 0 && (
                                            <div className="pt-1 border-t border-gray-700/30">
                                                <div className="text-gray-500 mb-1">Match Rules</div>
                                                <ul className="space-y-0.5 text-gray-400">
                                                    {entry.match_explanation.map((rule, i) => (
                                                        <li key={i} className="flex items-start gap-1.5">
                                                            <span className="text-gray-600 mt-0.5">•</span>
                                                            <span>{rule}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {/* Admin Override Actions */}
                                        {process.env.NEXT_PUBLIC_ADMIN_MODE === 'true' && (
                                            <div className="pt-2 border-t border-gray-700/30 flex gap-2">
                                                {!entry.manual_override ? (
                                                    <button
                                                        className="px-2 py-1 text-[10px] bg-blue-900/40 text-blue-400 border border-blue-700/40 rounded hover:bg-blue-900/60 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const entryFill = prompt('Enter entry fill ID:');
                                                            const exitFill = prompt('Enter exit fill ID:');
                                                            if (entryFill && exitFill) {
                                                                fetch(`/api/premarket/journal/${entry.id}/override-fills`, {
                                                                    method: 'PATCH',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ entry_fill_id: entryFill, exit_fill_id: exitFill }),
                                                                }).then(() => window.location.reload());
                                                            }
                                                        }}
                                                    >
                                                        🔒 Override Match
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="px-2 py-1 text-[10px] bg-gray-800 text-gray-400 border border-gray-700 rounded hover:bg-gray-700 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Clear manual override? Entry will be eligible for auto-reconciliation.')) {
                                                                fetch(`/api/premarket/journal/${entry.id}/clear-override`, {
                                                                    method: 'PATCH',
                                                                }).then(() => window.location.reload());
                                                            }
                                                        }}
                                                    >
                                                        🔓 Clear Override
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Trade Form */}
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <h4 className="font-medium text-gray-200 mb-3">📈 Trade Details</h4>
                                <div className="space-y-3">
                                    {/* Direction */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Direction</label>
                                        <select
                                            value={tradeForm.trade_direction}
                                            onChange={e => setTradeForm(p => ({ ...p, trade_direction: e.target.value as 'LONG' | 'SHORT' | '' }))}
                                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <option value="">Not taken</option>
                                            <option value="LONG">LONG</option>
                                            <option value="SHORT">SHORT</option>
                                        </select>
                                    </div>

                                    {/* Entry / Exit */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Entry $</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={tradeForm.entry_price}
                                                onChange={e => setTradeForm(p => ({ ...p, entry_price: e.target.value }))}
                                                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                                placeholder="0.00"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Exit $</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={tradeForm.exit_price}
                                                onChange={e => setTradeForm(p => ({ ...p, exit_price: e.target.value }))}
                                                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                                placeholder="0.00"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>

                                    {/* Position Size with Risk Mode */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs text-gray-500">Position Size</label>
                                            <div className="flex text-[10px]">
                                                {(['CONTRACTS', 'RISK_DOLLARS', 'RISK_PERCENT'] as RiskMode[]).map((mode) => {
                                                    const labels: Record<RiskMode, string> = { CONTRACTS: 'Shares', RISK_DOLLARS: 'Risk $', RISK_PERCENT: 'Risk %' };
                                                    const isFirst = mode === 'CONTRACTS';
                                                    const isLast = mode === 'RISK_PERCENT';
                                                    return (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setTradeForm(p => ({ ...p, risk_mode: mode })); }}
                                                            className={`px-2 py-0.5 border ${isFirst ? 'rounded-l' : ''} ${isLast ? 'rounded-r' : ''} ${tradeForm.risk_mode === mode
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
                                        {tradeForm.risk_mode === 'CONTRACTS' ? (
                                            <>
                                                <div className="flex items-center gap-1 mb-1">
                                                    <div className="flex text-[10px]">
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setTradeForm(p => ({ ...p, size_mode: 'SHARES' })); }}
                                                            className={`px-2 py-0.5 rounded-l border ${tradeForm.size_mode === 'SHARES'
                                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                                : 'bg-gray-800 border-gray-600 text-gray-400'
                                                                }`}
                                                        >
                                                            Shares
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setTradeForm(p => ({ ...p, size_mode: 'DOLLARS' })); }}
                                                            className={`px-2 py-0.5 rounded-r border-t border-r border-b ${tradeForm.size_mode === 'DOLLARS'
                                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                                : 'bg-gray-800 border-gray-600 text-gray-400'
                                                                }`}
                                                        >
                                                            Dollars
                                                        </button>
                                                    </div>
                                                </div>
                                                <input
                                                    type="number"
                                                    value={tradeForm.size_value}
                                                    onChange={e => setTradeForm(p => ({ ...p, size_value: e.target.value }))}
                                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                                    placeholder={tradeForm.size_mode === 'SHARES' ? 'Number of shares' : 'Dollar amount'}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                                {metrics && (
                                                    <div className="mt-1 text-[10px] text-gray-500">
                                                        {tradeForm.size_mode === 'SHARES'
                                                            ? `Position value: $${metrics.positionValue}`
                                                            : `≈ ${metrics.shares} shares • $${metrics.positionValue}`
                                                        }
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <input
                                                    type="number"
                                                    value={tradeForm.risk_value}
                                                    onChange={e => setTradeForm(p => ({ ...p, risk_value: e.target.value }))}
                                                    className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                                    placeholder={tradeForm.risk_mode === 'RISK_DOLLARS' ? 'Max risk in dollars' : '% of account to risk'}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                                {tradeForm.risk_mode === 'RISK_PERCENT' && (
                                                    <input
                                                        type="number"
                                                        value={tradeForm.account_size}
                                                        onChange={e => setTradeForm(p => ({ ...p, account_size: e.target.value }))}
                                                        className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200 mt-1"
                                                        placeholder="Account size ($)"
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                )}
                                                {sizingPreview && sizingPreview.suggestedShares > 0 && (
                                                    <div className="mt-1 p-1.5 bg-blue-900/20 border border-blue-800/30 rounded text-[10px]">
                                                        <div className="text-blue-300">
                                                            → {sizingPreview.suggestedShares} shares • Max loss: ${sizingPreview.maxLossDollars.toFixed(0)}
                                                        </div>
                                                        {sizingPreview.assumptions.map((a, i) => (
                                                            <div key={i} className="text-gray-500">{a}</div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Stop Loss (Optional) */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">
                                            Stop Loss $ <span className="text-gray-600">(optional, for R calc)</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={tradeForm.stop_loss}
                                            onChange={e => setTradeForm(p => ({ ...p, stop_loss: e.target.value }))}
                                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200"
                                            placeholder="0.00"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </div>

                                    {/* Execution Notes */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">
                                            Execution Notes
                                        </label>
                                        <textarea
                                            value={tradeForm.execution_notes}
                                            onChange={e => setTradeForm(p => ({ ...p, execution_notes: e.target.value }))}
                                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200 h-12"
                                            placeholder="What happened during the trade..."
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <div className="text-[10px] text-gray-600 mt-0.5">
                                            Fills, slippage, emotions, mistakes
                                        </div>
                                    </div>

                                    {/* Post-Trade Review */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">
                                            Post-Trade Review
                                        </label>
                                        <textarea
                                            value={tradeForm.review_notes}
                                            onChange={e => setTradeForm(p => ({ ...p, review_notes: e.target.value }))}
                                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200 h-12"
                                            placeholder="What you learned..."
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <div className="text-[10px] text-gray-600 mt-0.5">
                                            Lessons, what to do differently next time
                                        </div>
                                    </div>

                                    {/* Outcome Preview */}
                                    {metrics && (
                                        <div className="p-2 bg-gray-900/50 rounded border border-gray-700">
                                            <div className="text-xs text-gray-400 mb-2">📊 Outcome Preview</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-gray-500">P&L: </span>
                                                    {metrics.hasExit ? (
                                                        <span className={parseFloat(metrics.pnlDollars) >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                            ${metrics.pnlDollars}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-600">—</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">%: </span>
                                                    {metrics.hasExit ? (
                                                        <span className={parseFloat(metrics.pnlPercent) >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                            {metrics.pnlPercent}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-600">—</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Risk: </span>
                                                    {metrics.hasStopLoss ? (
                                                        <span className="text-gray-300">${metrics.riskDollars}</span>
                                                    ) : (
                                                        <span className="text-gray-600">—</span>
                                                    )}
                                                </div>
                                                {/* Hide R row entirely for AVOID plays */}
                                                {entry.play_type !== 'AVOID' && (
                                                    <div>
                                                        <span className="text-gray-500">R: </span>
                                                        {metrics.hasStopLoss && metrics.hasExit && metrics.rMultiple ? (
                                                            <span className={parseFloat(metrics.rMultiple) >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                {metrics.rMultiple}R
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-600" title={!metrics.hasStopLoss ? 'Set stop loss to calculate R' : 'Enter exit to calculate'}>
                                                                —
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Warning for missing stop/invalidation */}
                                            {entry.play_type === 'AVOID' ? (
                                                <div className="text-[10px] text-amber-500 mt-1">
                                                    ⚠ AVOID signal — no stop/invalidation; R disabled
                                                </div>
                                            ) : !metrics.hasStopLoss && (
                                                <div className="text-[10px] text-yellow-600 mt-1">
                                                    ⚠ No stop/invalidation available; R and risk metrics disabled
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Draft Toggle */}
                                    <div className="flex items-center gap-2 py-1">
                                        <input
                                            type="checkbox"
                                            id={`draft-${entry.id}`}
                                            checked={tradeForm.is_draft}
                                            onChange={e => { e.stopPropagation(); setTradeForm(p => ({ ...p, is_draft: e.target.checked })); }}
                                            className="rounded border-gray-600 bg-gray-900 text-amber-500 focus:ring-amber-500"
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <label htmlFor={`draft-${entry.id}`} className="text-xs text-gray-400 cursor-pointer" onClick={e => e.stopPropagation()}>
                                            Draft <span className="text-gray-600">(not counted toward risk limits)</span>
                                        </label>
                                    </div>

                                    {/* Save Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleSaveTrade(); }}
                                        disabled={isSaving}
                                        className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                                    >
                                        {isSaving ? '⏳ Saving...' : '💾 Save Trade'}
                                    </button>

                                    {/* Saved Outcome Display */}
                                    {outcome && (
                                        <div className="mt-2 pt-2 border-t border-gray-700">
                                            <h5 className="font-medium text-gray-300 mb-2 text-sm">✅ Saved Outcome</h5>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-gray-500">P&L: </span>
                                                    <span className={(outcome.pnlDollars ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                        ${outcome.pnlDollars?.toFixed(2)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">%: </span>
                                                    <span className={(outcome.pnlPercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                        {outcome.pnlPercent?.toFixed(2)}%
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">R: </span>
                                                    <span className="text-gray-300">
                                                        {outcome.rMultiple?.toFixed(2) ?? '—'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <ResultBadge result={outcome.result} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); onUpdateStatus(entry.status === 'OPEN' ? 'CLOSED' : 'OPEN'); }}
                                className={`px-3 py-1 text-sm rounded ${entry.status === 'OPEN'
                                    ? 'bg-gray-600 hover:bg-gray-500 text-white'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                                    }`}
                            >
                                {entry.status === 'OPEN' ? '✓ Mark Closed' : '↩ Reopen'}
                            </button>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function JournalPage() {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [filterSymbol, setFilterSymbol] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
    const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

    const fetchEntries = async () => {
        setLoading(true);
        setError(null);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const res = await fetch('/api/premarket/journal', {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            const contentType = res.headers.get('content-type');
            if (!contentType?.includes('application/json')) {
                const text = await res.text();
                console.error('[Journal] Non-JSON response:', text.slice(0, 200));
                setError(`Server error (${res.status}): ${text.slice(0, 100)}...`);
                setLoading(false);
                return;
            }

            const data = await res.json();

            if (data.success) {
                setEntries(data.entries);
            } else {
                setError(data.message || 'Failed to load journal');
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                setError('Request timed out. Check if the server is running.');
            } else {
                setError(err instanceof Error ? err.message : 'Network error');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, []);

    const updateEntry = async (id: string, updates: Record<string, unknown>) => {
        setSavingIds(prev => new Set(prev).add(id));
        try {
            const res = await fetch(`/api/premarket/journal/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            const data = await res.json();
            if (data.success) {
                setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data.entry } : e));
            } else {
                alert(`Failed to update: ${data.message}`);
            }
        } catch (err) {
            alert(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setSavingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Filter entries
    const filteredEntries = entries.filter(e => {
        if (filterSymbol && !e.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) {
            return false;
        }
        if (filterStatus !== 'ALL' && e.status !== filterStatus) {
            return false;
        }
        return true;
    });

    // Stats
    const stats = {
        total: entries.length,
        open: entries.filter(e => e.status === 'OPEN').length,
        trades: entries.filter(e => e.trade_direction).length,
        wins: entries.filter(e => e.outcome?.result === 'WIN').length,
        losses: entries.filter(e => e.outcome?.result === 'LOSS').length,
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">📓 Premarket Journal</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Track signals and trade outcomes
                        </p>
                    </div>
                    <Link
                        href="/premarket"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-center"
                    >
                        ← Back to Scanner
                    </Link>
                </div>

                {/* Stats */}
                {!loading && entries.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-white">{stats.total}</div>
                            <div className="text-xs text-gray-500">Signals</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-blue-400">{stats.open}</div>
                            <div className="text-xs text-gray-500">Open</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-purple-400">{stats.trades}</div>
                            <div className="text-xs text-gray-500">Trades</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
                            <div className="text-xs text-gray-500">Wins</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
                            <div className="text-xs text-gray-500">Losses</div>
                        </div>
                    </div>
                )}

                {/* Broker Sync Panel */}
                <BrokerSyncPanel />

                {/* Filters */}
                <div className="flex flex-wrap gap-4 mb-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Symbol</label>
                        <input
                            type="text"
                            value={filterSymbol}
                            onChange={e => setFilterSymbol(e.target.value)}
                            placeholder="Filter by symbol..."
                            className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-gray-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Status</label>
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
                            className="px-3 py-2 bg-gray-900 border border-gray-600 rounded text-gray-200"
                        >
                            <option value="ALL">All</option>
                            <option value="OPEN">Open</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={fetchEntries}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                            🔄 Refresh
                        </button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                        <div className="text-red-400">❌ {error}</div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="text-center py-12 text-gray-500">
                        ⏳ Loading journal entries...
                    </div>
                )}

                {/* Entries Table */}
                {!loading && filteredEntries.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-800/50 text-gray-400 text-sm">
                                <tr>
                                    <th className="px-4 py-3">Symbol</th>
                                    <th className="px-4 py-3">Gap%</th>
                                    <th className="px-4 py-3">Play</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Source</th>
                                    <th className="px-4 py-3">
                                        <span className="flex items-center gap-1">
                                            Mode
                                            <span
                                                className="text-gray-500 text-[10px] cursor-help"
                                                title="OPEN FALLBACK means no true premarket snapshot was available; gap used market open price"
                                            >
                                                ⓘ
                                            </span>
                                        </span>
                                    </th>
                                    <th className="px-4 py-3">Trade</th>
                                    <th className="px-4 py-3">Result</th>
                                    <th className="px-4 py-3">P&L</th>
                                    <th className="px-4 py-3">R</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map(entry => (
                                    <EntryRow
                                        key={entry.id}
                                        entry={entry}
                                        isExpanded={expandedRow === entry.id}
                                        onToggle={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                                        onUpdateStatus={(status) => updateEntry(entry.id, { status })}
                                        onUpdateTrade={(updates) => updateEntry(entry.id, updates)}
                                        isSaving={savingIds.has(entry.id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Empty State */}
                {!loading && filteredEntries.length === 0 && !error && (
                    <div className="text-center py-12 text-gray-500">
                        {entries.length === 0
                            ? 'No journal entries yet. Save candidates from the scanner!'
                            : 'No entries match filters'
                        }
                    </div>
                )}

                {/* Count */}
                {!loading && entries.length > 0 && (
                    <div className="mt-4 text-sm text-gray-500">
                        Showing {filteredEntries.length} of {entries.length} entries
                    </div>
                )}
            </div>
        </div>
    );
}
