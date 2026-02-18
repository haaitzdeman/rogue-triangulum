export const dynamic = 'force-dynamic';

/**
 * Morning Run API Route
 *
 * POST /api/morning-run
 *
 * One-button workflow that orchestrates:
 * 1. Premarket gap scan (using existing runPremarketScan)
 * 2. Options scan for top N candidates
 * 3. Today opportunity ranking
 *
 * Persists run to morning_run_runs table via morning-run-store.
 *
 * SECURITY: No API keys in responses. Provider errors truncated to 200 chars.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import {
    runPremarketScan,
    resolvePremarketDate,
    isDateOutOfRangeError,
    getPremarketUniverse,
    DEFAULT_GAP_SCANNER_CONFIG,
    DEFAULT_ANALOG_CONFIG,
    fetchPolygonSnapshots,
    isLiveProviderConfigured,
} from '@/lib/brains/premarket';
import type { GapScannerConfig, AnalogConfig, GapCandidate } from '@/lib/brains/premarket';
import { scanOptions } from '@/lib/brains/options';
import { buildTodayOpportunities } from '@/lib/integration/today-builder';
import { writeAutoJournalEntries } from '@/lib/integration/auto-journal-writer';
import { saveMorningRun, loadMorningRunByRunId } from '@/lib/integration/morning-run-store';
import { computeDailyRiskState } from '@/lib/risk/risk-engine';
import { getRiskConfig } from '@/lib/risk/risk-config';
import { createServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase/server';
import { loadRiskEntriesForDate } from '@/lib/risk/risk-loader';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_SYMBOLS = 12;
const MIN_SYMBOL_THRESHOLD = 5;

// Default universe fallback (top liquid tickers)
const DEFAULT_UNIVERSE = [
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
    'META', 'TSLA', 'AMD', 'SPY', 'QQQ',
    'NFLX', 'CRM',
];

// =============================================================================
// Types
// =============================================================================

interface MorningRunRequest {
    date?: string | null;
    preferLive?: boolean | null;
    premarketConfig?: Partial<GapScannerConfig> | null;
    optionsConfig?: Record<string, unknown> | null;
    maxSymbols?: number | null;
    force?: boolean | null;
    autoJournal?: boolean | null;
    autoJournalScoreThreshold?: number | null;
}

interface OptionsError {
    symbol: string;
    provider: string;
    status?: string;
    code?: string;
    messagePreview?: string;
}

interface MorningRunResponse {
    success: true;
    date: string;
    premarket: {
        candidateCount: number;
        resolved: { mode: string; effectiveDate: string; reason?: string };
        fromCache: boolean;
    };
    options: {
        requested: number;
        completed: number;
        fromCacheCount: number;
        errors: OptionsError[];
    };
    today: {
        opportunityCount: number;
    };
    autoJournalResult?: {
        created: number;
        skipped: number;
        errors: string[];
    };
    riskBlocked?: boolean;
    riskReason?: string;
    reproducibility: {
        candidateIdentifiers: { symbol: string; gapPct: number; playType: string }[];
        optionsScanTimestamps: Record<string, string>;
        opportunityInputs: { symbol: string; overallScore: number; alignment: string }[];
    };
    runId: string;
    generatedAt: string;
}

// =============================================================================
// Helpers
// =============================================================================

function generateRunId(date: string, config: Record<string, unknown>): string {
    const hash = crypto.createHash('sha256')
        .update(date + JSON.stringify(config))
        .digest('hex')
        .slice(0, 12);
    return `run-${hash}`;
}

/**
 * Select symbols for options scans from premarket candidates.
 * Takes top N by |gapPct| descending, excludes AVOID unless result < 5.
 */
function selectSymbolsForOptions(
    candidates: GapCandidate[],
    maxSymbols: number,
): string[] {
    // First pass: exclude AVOID
    const nonAvoid = candidates
        .filter(c => c.playType !== 'AVOID')
        .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
        .slice(0, maxSymbols)
        .map(c => c.symbol);

    // If we have enough, return
    if (nonAvoid.length >= MIN_SYMBOL_THRESHOLD) {
        return nonAvoid;
    }

    // Otherwise include AVOID candidates to reach threshold
    const all = candidates
        .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
        .slice(0, maxSymbols)
        .map(c => c.symbol);

    return all;
}

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json() as MorningRunRequest;

        const preferLive = body.preferLive ?? false;
        const force = body.force ?? false;
        const maxSymbols = Math.min(Math.max(body.maxSymbols ?? DEFAULT_MAX_SYMBOLS, 1), 30);
        const autoJournal = body.autoJournal ?? false;
        const autoJournalScoreThreshold = body.autoJournalScoreThreshold ?? 70;

        // === SCHEMA GUARD (FAIL-CLOSED) ===
        // autoJournal MUST have a working DB — refuse to proceed without one
        if (autoJournal && !isServerSupabaseConfigured()) {
            console.error('[MorningRun] FAIL-CLOSED: autoJournal=true but server DB not configured');
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DB_NOT_CONFIGURED',
                    error: 'autoJournal requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Refusing to proceed (fail-closed).',
                },
                { status: 503 },
            );
        }

        // Determine effective date
        const today = new Date().toISOString().slice(0, 10);
        const effectiveDate = body.date ?? today;

        // Build configs
        const scannerConfig: GapScannerConfig = {
            minAbsGapPct: body.premarketConfig?.minAbsGapPct ?? DEFAULT_GAP_SCANNER_CONFIG.minAbsGapPct,
            minPrice: body.premarketConfig?.minPrice ?? 5,
            minAvgDailyVolume20: body.premarketConfig?.minAvgDailyVolume20 ?? DEFAULT_GAP_SCANNER_CONFIG.minAvgDailyVolume20,
            excludeETFs: body.premarketConfig?.excludeETFs ?? true,
        };

        const analogConfig: AnalogConfig = { ...DEFAULT_ANALOG_CONFIG };

        const runConfig = {
            date: effectiveDate,
            preferLive,
            force,
            maxSymbols,
            scannerConfig,
            analogConfig,
        };
        const runId = generateRunId(effectiveDate, runConfig);

        // Check cache (unless force)
        if (!force && isServerSupabaseConfigured()) {
            try {
                const supabase = createServerSupabase();
                const cached = await loadMorningRunByRunId(supabase, runId);
                if (cached) {
                    return NextResponse.json((cached as { payload: unknown }).payload);
                }
            } catch {
                // DB unavailable — proceed with fresh run
            }
        }

        // =====================================================================
        // Step A1: Run premarket scan
        // =====================================================================

        let liveCoverageCount = 0;
        let universeCount = DEFAULT_UNIVERSE.length;

        if (preferLive && isLiveProviderConfigured()) {
            const universe = getPremarketUniverse();
            universeCount = universe.length;
            const sampleSymbols = universe.slice(0, 10);
            try {
                const result = await fetchPolygonSnapshots(sampleSymbols);
                let count = 0;
                result.snapshots.forEach((snap) => {
                    if (snap.livePrice !== null) count++;
                });
                liveCoverageCount = count;
            } catch {
                liveCoverageCount = 0;
            }
        }

        const resolved = resolvePremarketDate({
            requestedDate: effectiveDate === today ? undefined : effectiveDate,
            preferLive: preferLive,
            liveCoverageCount,
            universeCount,
            clamp: true,
        });

        // Handle date resolution errors
        if (isDateOutOfRangeError(resolved)) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATE_OUT_OF_RANGE',
                    error: `Date out of range. Suggestion: ${resolved.suggestion}`,
                },
                { status: 400 },
            );
        }

        const scanResult = runPremarketScan(
            new Date(resolved.effectiveDate + 'T12:00:00Z'),
            {
                force,
                scannerConfig,
                analogConfig,
                resolved: {
                    requestedDate: resolved.requestedDate,
                    effectiveDate: resolved.effectiveDate,
                    mode: resolved.mode,
                    reason: resolved.reason,
                    datasetRange: resolved.datasetRange,
                },
            },
        );

        const premarketFromCache = false; // runPremarketScan always runs fresh when force
        const premarket = {
            candidateCount: scanResult.candidates.length,
            resolved: {
                mode: resolved.mode,
                effectiveDate: resolved.effectiveDate,
                reason: resolved.reason,
            },
            fromCache: premarketFromCache,
        };

        // =====================================================================
        // Step A2: Select symbols for options scans
        // =====================================================================

        let symbolsToScan: string[];
        if (scanResult.candidates.length > 0) {
            symbolsToScan = selectSymbolsForOptions(scanResult.candidates, maxSymbols);
        } else {
            symbolsToScan = DEFAULT_UNIVERSE.slice(0, maxSymbols);
        }

        // =====================================================================
        // Step A3: Run options scans
        // =====================================================================

        const optionsErrors: OptionsError[] = [];
        let optionsCompleted = 0;
        let optionsFromCache = 0;

        for (const symbol of symbolsToScan) {
            try {
                const result = await scanOptions(symbol, {}, force);
                if (result.success) {
                    optionsCompleted++;
                    if (result.fromCache) optionsFromCache++;
                } else {
                    optionsErrors.push({
                        symbol,
                        provider: 'polygon',
                        status: result.errorCode,
                        messagePreview: result.error?.slice(0, 200),
                    });
                }
            } catch (err) {
                optionsErrors.push({
                    symbol,
                    provider: 'polygon',
                    status: 'EXCEPTION',
                    messagePreview: (err instanceof Error ? err.message : 'Unknown').slice(0, 200),
                });
            }
        }

        // =====================================================================
        // Step A4: Build today opportunities
        // =====================================================================

        const todayResult = buildTodayOpportunities(effectiveDate);

        // =====================================================================
        // Step A5: Auto-journal (optional)
        // =====================================================================

        let autoJournalResult: { created: number; skipped: number; errors: string[] } | undefined;
        let riskBlocked = false;
        let riskReason: string | undefined;

        if (autoJournal && todayResult.opportunities.length > 0) {
            // === RISK GUARDRAIL (FAIL-CLOSED) ===
            const riskConfig = getRiskConfig();
            try {
                const serverDb = createServerSupabase();
                const riskEntries = await loadRiskEntriesForDate(serverDb, effectiveDate);
                const riskState = computeDailyRiskState(riskEntries, riskConfig);

                if (riskState.dailyLossLimitBreached) {
                    riskBlocked = true;
                    riskReason = `Daily loss limit breached (PnL: $${riskState.totalPnl}, limit: -$${riskConfig.dailyMaxLoss})`;
                    console.warn(`[MorningRun] Risk blocked autoJournal: ${riskReason}`);
                } else if (riskState.openPositions >= riskConfig.maxOpenPositions) {
                    riskBlocked = true;
                    riskReason = `Max open positions reached (${riskState.openPositions}/${riskConfig.maxOpenPositions})`;
                    console.warn(`[MorningRun] Risk blocked autoJournal: ${riskReason}`);
                }
            } catch (riskErr) {
                // FAIL CLOSED: if risk check fails for ANY reason, block autoJournal
                riskBlocked = true;
                riskReason = `RISK_CHECK_FAILED_FAIL_CLOSED: ${riskErr instanceof Error ? riskErr.message : 'Unknown error'}`;
                console.error(`[MorningRun] Risk check failed — FAIL CLOSED: ${riskReason}`);
            }

            if (!riskBlocked) {
                const opps = todayResult.opportunities.map(o => ({
                    symbol: o.symbol,
                    score: o.overallScore,
                    direction: o.premarket?.direction,
                    playType: o.premarket?.playType,
                    confidence: o.premarket?.confidence,
                    gapPct: o.premarket?.gapPct,
                    because: o.reasoning?.join('; '),
                }));

                autoJournalResult = await writeAutoJournalEntries(opps, {
                    runId,
                    date: effectiveDate,
                    scoreThreshold: autoJournalScoreThreshold,
                    journalType: 'premarket',
                });
            }
        }

        // =====================================================================
        // Reproducibility data
        // =====================================================================

        const candidateIdentifiers = scanResult.candidates.map(c => ({
            symbol: c.symbol,
            gapPct: c.gapPct,
            playType: c.playType,
        }));

        const opportunityInputs = todayResult.opportunities.map(o => ({
            symbol: o.symbol,
            overallScore: o.overallScore,
            alignment: o.alignment,
        }));

        // =====================================================================
        // Build + save response
        // =====================================================================

        const response: MorningRunResponse = {
            success: true,
            date: effectiveDate,
            premarket,
            options: {
                requested: symbolsToScan.length,
                completed: optionsCompleted,
                fromCacheCount: optionsFromCache,
                errors: optionsErrors,
            },
            today: {
                opportunityCount: todayResult.opportunities.length,
            },
            ...(autoJournalResult ? { autoJournalResult } : {}),
            ...(riskBlocked ? { riskBlocked, riskReason } : {}),
            reproducibility: {
                candidateIdentifiers,
                optionsScanTimestamps: todayResult.freshness?.optionsScanTimestamps ?? {},
                opportunityInputs,
            },
            runId,
            generatedAt: new Date().toISOString(),
        };

        // Persist to DB (best-effort — don't block response on save failure)
        if (isServerSupabaseConfigured()) {
            try {
                const supabase = createServerSupabase();
                await saveMorningRun({
                    supabase,
                    runId,
                    runDate: effectiveDate,
                    generatedAt: response.generatedAt,
                    meta: {
                        preferLive,
                        force,
                        maxSymbols,
                        autoJournal,
                        autoJournalThreshold: autoJournalScoreThreshold,
                        riskBlocked: riskBlocked ?? false,
                        riskReason: riskReason ?? null,
                    },
                    payload: response,
                });
            } catch (saveErr) {
                console.error('[MorningRun] Failed to persist run to DB:', saveErr);
            }
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[MorningRun] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
