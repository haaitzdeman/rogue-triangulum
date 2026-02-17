/**
 * Opportunity Engine Tests
 *
 * Tests for:
 * - Score determinism
 * - Score cap at 100
 * - Alignment logic (ALIGNED, PARTIAL, CONFLICT, NONE)
 * - Individual factor weights
 */

import { computeOpportunityScore, buildRankedOpportunity } from '../opportunity-engine';
import type { GapCandidate } from '@/lib/premarket/premarket-types';
import type { OptionScanCandidate } from '@/lib/options/options-types';

// =============================================================================
// Fixtures
// =============================================================================

function makePremarket(overrides: Partial<GapCandidate> = {}): GapCandidate {
    return {
        symbol: 'AAPL',
        gapPct: 5.0,
        direction: 'UP',
        prevClose: 190,
        gapReferencePrice: 200,
        avgDailyVolume20: 5000000,
        dataMode: 'PREMARKET',
        playType: 'CONTINUATION',
        confidence: 'HIGH',
        lowConfidence: false,
        because: 'Strong bullish gap',
        keyLevels: { prevClose: 190, gapReferencePrice: 200 },
        invalidation: 'Below 188',
        riskNote: 'Watch volume',
        analogStats: {
            sampleSize: 45,
            hitRate: 62,
            avgMFE: 2.5,
            avgMAE: 1.2,
            continuationPct: 0.8,
            regimeTag: 'normal',
        },
        ...overrides,
    };
}

function makeOptions(overrides: Partial<OptionScanCandidate> = {}): OptionScanCandidate {
    return {
        underlyingSymbol: 'AAPL',
        underlyingPrice: 200,
        ivRank: { rank: 0.25, classification: 'LOW', lowData: false },
        expectedMove: { expectedMove: 8.5, expectedRange: { low: 191.5, high: 208.5 } },
        liquidityScore: 75,
        strategySuggestion: 'LONG_CALL',
        rationale: 'IV is low, long call',
        contracts: [],
        totalContractsScanned: 100,
        scannedAt: '2026-02-07T12:00:00.000Z',
        ...overrides,
    };
}

// =============================================================================
// Alignment Tests
// =============================================================================

describe('computeOpportunityScore — alignment', () => {
    it('returns NONE when both inputs are null', () => {
        const result = computeOpportunityScore(null, null);
        expect(result.alignment).toBe('NONE');
        expect(result.overallScore).toBe(0);
    });

    it('returns PARTIAL when only premarket is present', () => {
        const result = computeOpportunityScore(makePremarket(), null);
        expect(result.alignment).toBe('PARTIAL');
        expect(result.overallScore).toBeGreaterThan(0);
    });

    it('returns PARTIAL when only options is present', () => {
        const result = computeOpportunityScore(null, makeOptions());
        expect(result.alignment).toBe('PARTIAL');
        expect(result.overallScore).toBeGreaterThan(0);
    });

    it('returns ALIGNED for bullish gap + LONG_CALL', () => {
        const result = computeOpportunityScore(
            makePremarket({ direction: 'UP' }),
            makeOptions({ strategySuggestion: 'LONG_CALL' }),
        );
        expect(result.alignment).toBe('ALIGNED');
    });

    it('returns ALIGNED for bearish gap + LONG_PUT', () => {
        const result = computeOpportunityScore(
            makePremarket({ direction: 'DOWN' }),
            makeOptions({ strategySuggestion: 'LONG_PUT' }),
        );
        expect(result.alignment).toBe('ALIGNED');
    });

    it('returns ALIGNED for any gap + CREDIT_SPREAD (selling premium)', () => {
        const result = computeOpportunityScore(
            makePremarket({ direction: 'UP' }),
            makeOptions({
                strategySuggestion: 'CREDIT_SPREAD',
                ivRank: { rank: 0.75, classification: 'HIGH', lowData: false },
            }),
        );
        expect(result.alignment).toBe('ALIGNED');
    });

    it('returns CONFLICT for bullish gap + LONG_PUT', () => {
        const result = computeOpportunityScore(
            makePremarket({ direction: 'UP' }),
            makeOptions({ strategySuggestion: 'LONG_PUT' }),
        );
        expect(result.alignment).toBe('CONFLICT');
    });

    it('returns CONFLICT for bearish gap + LONG_CALL', () => {
        const result = computeOpportunityScore(
            makePremarket({ direction: 'DOWN' }),
            makeOptions({ strategySuggestion: 'LONG_CALL' }),
        );
        expect(result.alignment).toBe('CONFLICT');
    });

    it('returns PARTIAL when premarket is AVOID', () => {
        const result = computeOpportunityScore(
            makePremarket({ playType: 'AVOID' }),
            makeOptions(),
        );
        expect(result.alignment).toBe('PARTIAL');
    });

    it('returns PARTIAL when options is AVOID', () => {
        const result = computeOpportunityScore(
            makePremarket(),
            makeOptions({ strategySuggestion: 'AVOID' }),
        );
        expect(result.alignment).toBe('PARTIAL');
    });
});

// =============================================================================
// Score Tests
// =============================================================================

describe('computeOpportunityScore — scoring', () => {
    it('score is deterministic (same inputs → same output)', () => {
        const pm = makePremarket();
        const opt = makeOptions();
        const r1 = computeOpportunityScore(pm, opt);
        const r2 = computeOpportunityScore(pm, opt);
        expect(r1.overallScore).toBe(r2.overallScore);
        expect(r1.alignment).toBe(r2.alignment);
    });

    it('score is capped at 100', () => {
        // Best case: everything perfect
        const result = computeOpportunityScore(
            makePremarket({
                confidence: 'HIGH',
                playType: 'CONTINUATION',
                analogStats: { sampleSize: 100, hitRate: 80, avgMFE: 3, avgMAE: 0.5, continuationPct: 1, regimeTag: 'normal' },
            }),
            makeOptions({
                strategySuggestion: 'LONG_CALL',
                ivRank: { rank: 0.2, classification: 'LOW', lowData: false },
                liquidityScore: 90,
            }),
        );
        expect(result.overallScore).toBeLessThanOrEqual(100);
        expect(result.overallScore).toBeGreaterThan(0);
    });

    it('score is 0 for no data', () => {
        const result = computeOpportunityScore(null, null);
        expect(result.overallScore).toBe(0);
    });

    it('gives +20 for HIGH premarket confidence', () => {
        const high = computeOpportunityScore(makePremarket({ confidence: 'HIGH' }), null);
        const low = computeOpportunityScore(makePremarket({ confidence: 'LOW' }), null);
        expect(high.overallScore).toBe(low.overallScore + 20);
    });

    it('gives +15 for non-AVOID play type', () => {
        const cont = computeOpportunityScore(makePremarket({ playType: 'CONTINUATION', confidence: 'LOW' }), null);
        const avoid = computeOpportunityScore(makePremarket({ playType: 'AVOID', confidence: 'LOW' }), null);
        expect(cont.overallScore - avoid.overallScore).toBe(15);
    });

    it('gives +10 for adequate analog sample', () => {
        const good = computeOpportunityScore(
            makePremarket({ confidence: 'LOW', analogStats: { ...makePremarket().analogStats, sampleSize: 50 } }),
            null,
        );
        const bad = computeOpportunityScore(
            makePremarket({ confidence: 'LOW', analogStats: { ...makePremarket().analogStats, sampleSize: 10 } }),
            null,
        );
        expect(good.overallScore - bad.overallScore).toBe(10);
    });

    it('gives +10 for liquidity > 50', () => {
        const high = computeOpportunityScore(null, makeOptions({ liquidityScore: 75 }));
        const low = computeOpportunityScore(null, makeOptions({ liquidityScore: 30 }));
        expect(high.overallScore - low.overallScore).toBe(10);
    });

    it('applies -10 penalty for CONFLICT', () => {
        const conflict = computeOpportunityScore(
            makePremarket({ direction: 'UP', confidence: 'LOW', playType: 'CONTINUATION' }),
            makeOptions({ strategySuggestion: 'LONG_PUT' }),
        );
        const aligned = computeOpportunityScore(
            makePremarket({ direction: 'UP', confidence: 'LOW', playType: 'CONTINUATION' }),
            makeOptions({ strategySuggestion: 'LONG_CALL' }),
        );
        // Aligned gets +10, conflict gets -10 = 20pt swing
        expect(aligned.overallScore - conflict.overallScore).toBe(20);
    });

    it('includes reasoning strings', () => {
        const result = computeOpportunityScore(makePremarket(), makeOptions());
        expect(result.reasoning.length).toBeGreaterThan(0);
        expect(result.reasoning.every(r => typeof r === 'string')).toBe(true);
    });
});

// =============================================================================
// buildRankedOpportunity
// =============================================================================

describe('buildRankedOpportunity', () => {
    it('builds a complete opportunity object', () => {
        const opp = buildRankedOpportunity('AAPL', makePremarket(), makeOptions());
        expect(opp.symbol).toBe('AAPL');
        expect(opp.overallScore).toBeGreaterThan(0);
        expect(opp.alignment).toBeDefined();
        expect(opp.premarket).not.toBeNull();
        expect(opp.options).not.toBeNull();
        expect(opp.premarket!.direction).toBe('UP');
        expect(opp.options!.strategySuggestion).toBe('LONG_CALL');
    });

    it('handles null premarket', () => {
        const opp = buildRankedOpportunity('SPY', null, makeOptions());
        expect(opp.premarket).toBeNull();
        expect(opp.options).not.toBeNull();
    });

    it('handles null options', () => {
        const opp = buildRankedOpportunity('TSLA', makePremarket(), null);
        expect(opp.premarket).not.toBeNull();
        expect(opp.options).toBeNull();
    });

    it('handles both null', () => {
        const opp = buildRankedOpportunity('XYZ', null, null);
        expect(opp.overallScore).toBe(0);
        expect(opp.alignment).toBe('NONE');
        expect(opp.premarket).toBeNull();
        expect(opp.options).toBeNull();
    });
});
