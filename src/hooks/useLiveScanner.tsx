'use client';

/**
 * useLiveScanner Hook - V2 (Orchestrator-Based)
 * 
 * This hook ONLY:
 * - Calls the orchestrator for candidates
 * - Handles loading/error state
 * - Returns orchestrator results
 * 
 * NO INDICATOR MATH HERE - all analysis is done in SwingBrain via strategies.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppMode } from '@/contexts/AppModeContext';
import { useDataProvider } from '@/hooks/useMarketData';
import { getOrchestrator } from '@/lib/core/orchestrator';
import { SwingBrain } from '@/lib/brains/specialists/swing-brain';
import { prepareCandidatesForRecording, type ExtendedCandidate } from '@/lib/journal/signal-prep';
// V1: DayTradingBrain removed - swing only
import type { MarketContext, Candidate } from '@/lib/core/types';

// Re-export TradingCandidate for backwards compatibility
export interface TradingCandidate {
    id: string;
    symbol: string;
    name: string;
    setupType: string;
    score: number;
    confidence: number;
    priceChange: number;
    invalidation: number;
    reasons: string[];
    direction: 'long' | 'short';
    currentPrice: number;
    signals: {
        name: string;
        direction: string;
        strength: number;
    }[];
}

// Mock candidates for test mode
const MOCK_CANDIDATES: TradingCandidate[] = [
    {
        id: 'mock-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        setupType: 'Test Mode',
        score: 78,
        confidence: 0.82,
        priceChange: 1.24,
        invalidation: 178.50,
        reasons: ['Test mode active', 'Mock data'],
        direction: 'long',
        currentPrice: 182.50,
        signals: [],
    },
    {
        id: 'mock-2',
        symbol: 'NVDA',
        name: 'NVIDIA Corp',
        setupType: 'Test Mode',
        score: 85,
        confidence: 0.75,
        priceChange: 2.87,
        invalidation: 875.00,
        reasons: ['Test mode active', 'Mock data'],
        direction: 'long',
        currentPrice: 912.00,
        signals: [],
    },
];

// Initialize orchestrator with brains (singleton)
let orchestratorInitialized = false;

function initOrchestrator(): void {
    if (orchestratorInitialized) return;

    const orchestrator = getOrchestrator();

    // V1: Register only SwingBrain - day trading not ready
    try {
        orchestrator.registerBrain(new SwingBrain());
    } catch (e) {
        console.error('[useLiveScanner] Failed to register SwingBrain:', e);
    }

    orchestratorInitialized = true;
    console.log('[useLiveScanner] V1: Orchestrator initialized with SwingBrain only');
}

/**
 * Record signals to journal via API (non-blocking)
 * Uses ExtendedCandidate type - no fragile prediction extraction
 */
async function recordToJournal(
    candidates: unknown[],
    context: MarketContext
): Promise<void> {
    try {
        // Cast to ExtendedCandidate - SwingBrain includes these extended fields
        const extendedCandidates: ExtendedCandidate[] = candidates.map((c) => {
            const r = c as Record<string, unknown>;
            return {
                symbol: String(r.symbol ?? ''),
                score: Number(r.score ?? 0),
                direction: (r.direction as 'long' | 'short' | 'neutral') ?? 'neutral',
                reasons: (r.reasons as string[]) ?? [],
                timestamp: Number(r.timestamp ?? context.timestamp),
                name: r.name as string | undefined,
                strategyName: r.strategyName as string | undefined,
                setupType: r.setupType as string | undefined,
                confidence: r.confidence as number | undefined,
                invalidation: r.invalidation as number | undefined,
                currentPrice: r.currentPrice as number | undefined,
                priceChange: r.priceChange as number | undefined,
                regimeTrending: r.regimeTrending as boolean | undefined,
                regimeHighVol: r.regimeHighVol as boolean | undefined,
                signals: r.signals as Array<{ name: string; direction: string; strength: number }> | undefined,
            };
        });

        // Prepare for recording
        const prepared = prepareCandidatesForRecording(
            extendedCandidates,
            { timestamp: context.timestamp }
        );

        console.log(`[Client] journal POST candidates=${extendedCandidates.length} prepared=${prepared.length}`);

        if (prepared.length === 0) {
            console.log('[Client] All candidates filtered out (neutral)');
            return;
        }

        // Send to API for server-side persistence
        const response = await fetch('/api/journal/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidates: prepared }),
        });

        const result = await response.json();
        console.log(`[Client] journal POST status=${response.status} added=${result.added} skipped=${result.skipped}`);
    } catch (error: unknown) {
        // Non-blocking - don't fail the scan if journal recording fails
        console.warn('[Client] Journal recording error:', error);
    }
}

/**
 * Convert Candidate to TradingCandidate format
 */
function toTradingCandidate(candidate: Candidate & { name?: string; setupType?: string; confidence?: number; invalidation?: number; currentPrice?: number; priceChange?: number; signals?: Array<{ name: string; direction: string; strength: number }> }): TradingCandidate | null {
    // Filter out neutral candidates - we only want long/short
    if (candidate.direction === 'neutral') return null;

    // B) Deterministic ID using timestamp + setupType
    const setupKey = (candidate.setupType ?? 'setup').replace(/\s+/g, '-').toLowerCase();
    return {
        id: `${candidate.symbol}-${candidate.timestamp}-${setupKey}`,
        symbol: candidate.symbol,
        name: candidate.name || candidate.symbol,
        setupType: candidate.setupType || 'Strategy Signal',
        score: Math.round(candidate.score),
        confidence: candidate.confidence ?? candidate.score / 100,
        priceChange: candidate.priceChange ?? 0,
        invalidation: candidate.invalidation ?? 0,
        reasons: candidate.reasons,
        direction: candidate.direction as 'long' | 'short',
        currentPrice: candidate.currentPrice ?? 0,
        signals: candidate.signals ?? [],
    };
}

export function useLiveScanner(
    _desk: 'day-trading' | 'swing' | 'options' | 'investing' = 'swing',
    _symbols: string[] = []
) {
    // V1: Enforce swing desk only - ignore desk param
    const desk = 'swing' as const;
    const { isTest } = useAppMode();
    const { isMockMode } = useDataProvider();
    const [candidates, setCandidates] = useState<TradingCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastScan, setLastScan] = useState<Date | null>(null);

    const scanSymbols = useCallback(async () => {
        // In test mode, return mock candidates
        if (isTest || isMockMode) {
            setCandidates(MOCK_CANDIDATES);
            setLoading(false);
            setLastScan(new Date());
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Initialize orchestrator (idempotent)
            initOrchestrator();

            // Set active desk
            const orchestrator = getOrchestrator();
            orchestrator.setActiveDesk(desk);

            // Build market context
            const context: MarketContext = {
                timestamp: Date.now(),
                marketOpen: true,
                preMarket: false,
                afterHours: false,
                marketRegime: 'neutral',
            };

            // Request candidates from orchestrator
            console.log(`[useLiveScanner] Requesting candidates for desk: ${desk}`);
            const rankedCandidates = await orchestrator.requestCandidates(context);

            // Convert to TradingCandidate format (filter out nulls for neutral candidates)
            const tradingCandidates = rankedCandidates
                .map(toTradingCandidate)
                .filter((c): c is TradingCandidate => c !== null);

            // ---------- SIGNAL JOURNAL RECORDING ----------
            // Record top 10 signals for performance tracking (non-blocking)
            if (rankedCandidates.length > 0) {
                recordToJournal(rankedCandidates.slice(0, 10), context).catch((err) => {
                    console.warn('[Client] Journal recording error:', err);
                });
            }
            // ------------------------------------------------

            setCandidates(tradingCandidates);
            setLastScan(new Date());
            console.log(`[useLiveScanner] Found ${tradingCandidates.length} candidates`);
        } catch (err) {
            console.error('[useLiveScanner] Error:', err);
            setError('Failed to scan symbols');
            // Fall back to mock data on error
            setCandidates(MOCK_CANDIDATES);
        } finally {
            setLoading(false);
        }
    }, [isTest, isMockMode, desk]);

    // Initial scan
    useEffect(() => {
        scanSymbols();
    }, [scanSymbols]);

    return {
        candidates,
        loading,
        error,
        lastScan,
        rescan: scanSymbols,
        isLiveData: !isMockMode,
    };
}
