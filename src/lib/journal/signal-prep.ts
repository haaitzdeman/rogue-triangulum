/**
 * Signal Preparation (Client-Safe)
 * 
 * Prepares candidates for recording. This file is safe to import on the client
 * as it does NOT use Node.js modules like 'fs'.
 * 
 * Uses ACTUAL candidate fields, not fragile prediction extraction.
 */

import type { CandidateForRecording } from './signal-types';

/**
 * Extended candidate type matching what SwingBrain actually produces
 */
export interface ExtendedCandidate {
    symbol: string;
    score: number;
    direction: 'long' | 'short' | 'neutral';
    reasons: string[];
    timestamp: number;
    name?: string;
    // These are added by SwingBrain
    strategyName?: string;  // The actual strategy name source of truth
    setupType?: string;
    confidence?: number;
    invalidation?: number;
    currentPrice?: number;
    priceChange?: number;
    regimeTrending?: boolean;  // From candidate if available
    regimeHighVol?: boolean;   // From candidate if available
    signals?: Array<{ name: string; direction: string; strength: number }>;
}

/**
 * Prepare candidates for recording
 * 
 * Uses ACTUAL candidate fields. Does NOT rely on prediction extraction.
 * Regime tags: use candidate values if provided, otherwise FALSE (never assume true).
 */
export function prepareCandidatesForRecording(
    candidates: ExtendedCandidate[],
    _context: { timestamp: number }
): CandidateForRecording[] {
    const result: CandidateForRecording[] = [];

    for (const c of candidates) {
        // Skip neutral signals
        if (c.direction === 'neutral') {
            console.log(`[SignalPrep] Skipping neutral: ${c.symbol}`);
            continue;
        }

        // Use actual currentPrice from candidate, fallback to 100 for safety
        const currentPrice = c.currentPrice ?? 100;

        // Use actual confidence from candidate
        const confidence = c.confidence ?? (c.score / 100);

        // Use actual strategyName from candidate - DO NOT derive from setupType
        const strategyName = c.strategyName || 'Unknown';

        // Use actual setupType from candidate
        const setupType = c.setupType || strategyName;

        // Derive ATR from invalidation if available
        const invalidation = c.invalidation ?? (c.direction === 'long'
            ? currentPrice * 0.95
            : currentPrice * 1.05);
        const stopDistance = Math.abs(currentPrice - invalidation);
        const atrPercent = (stopDistance / currentPrice) * 100;
        const atrDollars = stopDistance;

        const targetR = 2;

        // Derive entry date (next trading day)
        const signalDate = new Date(c.timestamp);
        const entryDate = new Date(signalDate);
        entryDate.setDate(entryDate.getDate() + 1);
        // Skip weekend
        while (entryDate.getDay() === 0 || entryDate.getDay() === 6) {
            entryDate.setDate(entryDate.getDate() + 1);
        }

        // Regime tags: use candidate values if provided, otherwise FALSE (no fake truths)
        const regimeTrending = c.regimeTrending ?? false;
        const regimeHighVol = c.regimeHighVol ?? false;

        const record: CandidateForRecording = {
            symbol: c.symbol,
            strategyName: strategyName,
            setupType: setupType,
            direction: c.direction,
            score: c.score,
            confidence: confidence,
            reasons: c.reasons,
            signalBarTimestamp: c.timestamp,
            referenceEntryDate: entryDate.toISOString().slice(0, 10),
            riskStop: invalidation,
            targetPrice: c.direction === 'long'
                ? currentPrice + (stopDistance * targetR)
                : currentPrice - (stopDistance * targetR),
            targetR,
            atrDollars,
            atrPercent,
            regimeTrending,
            regimeHighVol,
            horizonDays: 7,
        };

        console.log(`[SignalPrep] Prepared: ${c.symbol} ${c.direction} score=${c.score} strategy=${strategyName}`);
        result.push(record);
    }

    console.log(`[SignalPrep] Total prepared: ${result.length} from ${candidates.length} input`);
    return result;
}
