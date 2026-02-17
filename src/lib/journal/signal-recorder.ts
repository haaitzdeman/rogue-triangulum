/**
 * Signal Recorder
 * 
 * Records scan results to the signal journal.
 * Called from Orchestrator AFTER ranking, BEFORE returning results.
 * 
 * This keeps the single truth path intact and supports future desks.
 */

import type { SignalRecord, CandidateForRecording } from './signal-types';
import { addSignals } from './signal-store';

/**
 * Generate deterministic signal ID
 */
function generateSignalId(candidate: CandidateForRecording): string {
    const strategyKey = candidate.strategyName
        .toLowerCase()
        .replace(/\s+/g, '-');
    return `${candidate.symbol}-${candidate.signalBarTimestamp}-${strategyKey}`;
}

/**
 * Convert scanner candidates to signal records
 */
function candidatesToSignalRecords(candidates: CandidateForRecording[]): SignalRecord[] {
    const now = new Date().toISOString();

    return candidates.map(candidate => ({
        id: generateSignalId(candidate),
        version: 'V1' as const,
        symbol: candidate.symbol,
        strategyName: candidate.strategyName,
        setupType: candidate.setupType,
        direction: candidate.direction,
        score: candidate.score,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
        signalBarTimestamp: candidate.signalBarTimestamp,
        entryBarTimestamp: null, // To be filled by evaluator
        referenceEntryDate: candidate.referenceEntryDate,
        referenceEntryPrice: null, // To be filled by evaluator
        riskStop: candidate.riskStop,
        targetPrice: candidate.targetPrice,
        targetR: candidate.targetR,
        atrDollars: candidate.atrDollars,
        atrPercent: candidate.atrPercent,
        regimeTrending: candidate.regimeTrending,
        regimeHighVol: candidate.regimeHighVol,
        horizonDays: candidate.horizonDays,
        status: 'pending' as const,
        createdAt: now,
    }));
}

/**
 * Record scan results to journal
 * 
 * Called from Orchestrator after ranking.
 * Uses API route for persistence (server-side only).
 */
export async function recordScanResults(
    candidates: CandidateForRecording[]
): Promise<{ added: number; skipped: number }> {
    if (candidates.length === 0) {
        return { added: 0, skipped: 0 };
    }

    const records = candidatesToSignalRecords(candidates);

    // In server context (API route), we can write directly
    // This function is called from API route, not client
    const result = addSignals(records);

    console.log(`[SignalRecorder] Recorded ${result.added} signals, skipped ${result.skipped} duplicates`);

    return result;
}

/**
 * Prepare candidates for recording (extract needed fields)
 * 
 * Call this in Orchestrator to prepare candidates before sending to record API.
 */
export function prepareCandidatesForRecording(
    candidates: Array<{
        symbol: string;
        score: number;
        direction: 'long' | 'short' | 'neutral';
        reasons: string[];
        timestamp: number;
        name?: string;
        setupType?: string;
        confidence?: number;
        invalidation?: number;
        currentPrice?: number;
        signals?: Array<{ name: string; direction: string; strength: number }>;
    }>,
    _context: { timestamp: number }
): CandidateForRecording[] {
    const result: CandidateForRecording[] = [];

    for (const c of candidates) {
        // Skip neutral signals
        if (c.direction === 'neutral') continue;

        // Derive entry date (next trading day)
        const signalDate = new Date(c.timestamp);
        const entryDate = new Date(signalDate);
        entryDate.setDate(entryDate.getDate() + 1);
        // Skip weekend
        while (entryDate.getDay() === 0 || entryDate.getDay() === 6) {
            entryDate.setDate(entryDate.getDate() + 1);
        }

        const currentPrice = c.currentPrice ?? 100;
        const atrPercent = 2; // Default 2%
        const atrDollars = currentPrice * (atrPercent / 100);
        const stopDistance = atrDollars * 1.5;
        const targetR = 2;

        result.push({
            symbol: c.symbol,
            strategyName: c.setupType?.split(' ')[0] || 'Strategy',
            setupType: c.setupType || 'Setup',
            direction: c.direction,
            score: c.score,
            confidence: c.confidence ?? c.score / 100,
            reasons: c.reasons,
            signalBarTimestamp: c.timestamp,
            referenceEntryDate: entryDate.toISOString().slice(0, 10),
            riskStop: c.direction === 'long'
                ? currentPrice - stopDistance
                : currentPrice + stopDistance,
            targetPrice: c.direction === 'long'
                ? currentPrice + (stopDistance * targetR)
                : currentPrice - (stopDistance * targetR),
            targetR,
            atrDollars,
            atrPercent,
            regimeTrending: true, // Will be computed properly when ADX is available
            regimeHighVol: atrPercent > 2,
            horizonDays: 7,
        });
    }

    return result;
}
