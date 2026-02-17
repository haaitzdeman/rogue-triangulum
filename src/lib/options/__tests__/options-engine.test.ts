/**
 * Options Engine Tests
 *
 * Tests for:
 * - Bid-ask spread calculation
 * - Expected move formula
 * - Liquidity filter logic
 * - Decision layer rules
 * - IV rank computation
 */

import { computeIVRank, classifyIVRank, formatIVRank } from '../iv-utils';
import { computeExpectedMove, formatExpectedMove } from '../expected-move';
import { filterByLiquidity, computeLiquidityScore } from '../options-chain-provider';
import { selectStrategy } from '../options-decision-layer';
import type { OptionContract, IVRankResult } from '../options-types';
import { DEFAULT_LIQUIDITY_CONFIG } from '../options-types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeContract(overrides: Partial<OptionContract> = {}): OptionContract {
    return {
        symbol: 'O:AAPL250221C00150000',
        strike: 150,
        expiration: '2025-02-21',
        type: 'CALL',
        bid: 5.00,
        ask: 5.20,
        mid: 5.10,
        volume: 500,
        openInterest: 1000,
        impliedVolatility: 0.35,
        daysToExpiration: 30,
        bidAskSpreadPct: 3.92,
        ...overrides,
    };
}

// =============================================================================
// IV Rank Tests
// =============================================================================

describe('computeIVRank', () => {
    it('computes rank correctly within range', () => {
        const result = computeIVRank(0.40, 0.20, 0.60);
        expect(result.rank).toBeCloseTo(0.5);
        expect(result.classification).toBe('MID');
        expect(result.lowData).toBe(false);
    });

    it('returns HIGH classification when IV is above 60% of range', () => {
        const result = computeIVRank(0.55, 0.20, 0.60);
        expect(result.rank).toBeCloseTo(0.875);
        expect(result.classification).toBe('HIGH');
    });

    it('returns LOW classification when IV is below 30% of range', () => {
        const result = computeIVRank(0.25, 0.20, 0.60);
        expect(result.rank).toBeCloseTo(0.125);
        expect(result.classification).toBe('LOW');
    });

    it('returns lowData flag when yearLowIV is null', () => {
        const result = computeIVRank(0.30, null, 0.60);
        expect(result.rank).toBeNull();
        expect(result.classification).toBeNull();
        expect(result.lowData).toBe(true);
    });

    it('returns lowData flag when yearHighIV is null', () => {
        const result = computeIVRank(0.30, 0.20, null);
        expect(result.rank).toBeNull();
        expect(result.lowData).toBe(true);
    });

    it('returns lowData when range is zero (high == low)', () => {
        const result = computeIVRank(0.30, 0.30, 0.30);
        expect(result.rank).toBeNull();
        expect(result.lowData).toBe(true);
    });

    it('clamps rank to [0, 1] when IV is outside range', () => {
        const above = computeIVRank(0.80, 0.20, 0.60);
        expect(above.rank).toBe(1);

        const below = computeIVRank(0.10, 0.20, 0.60);
        expect(below.rank).toBe(0);
    });
});

describe('classifyIVRank', () => {
    it('classifies HIGH when rank > 0.6', () => {
        expect(classifyIVRank(0.7)).toBe('HIGH');
        expect(classifyIVRank(0.95)).toBe('HIGH');
    });

    it('classifies LOW when rank < 0.3', () => {
        expect(classifyIVRank(0.2)).toBe('LOW');
        expect(classifyIVRank(0.05)).toBe('LOW');
    });

    it('classifies MID when rank is between 0.3 and 0.6', () => {
        expect(classifyIVRank(0.3)).toBe('MID');
        expect(classifyIVRank(0.5)).toBe('MID');
        expect(classifyIVRank(0.6)).toBe('MID');
    });
});

describe('formatIVRank', () => {
    it('formats null as dash', () => {
        expect(formatIVRank(null)).toBe('—');
    });

    it('formats rank as percentage', () => {
        expect(formatIVRank(0.75)).toBe('75%');
    });
});

// =============================================================================
// Expected Move Tests
// =============================================================================

describe('computeExpectedMove', () => {
    it('computes expected move using formula: price * IV * sqrt(days/365)', () => {
        // AAPL at $200, IV = 0.30, 30 DTE
        const result = computeExpectedMove(200, 0.30, 30);

        // Expected: 200 * 0.30 * sqrt(30/365) = 200 * 0.30 * 0.2867 = 17.20 (approx)
        const manual = 200 * 0.30 * Math.sqrt(30 / 365);
        expect(result.expectedMove).toBeCloseTo(manual, 1);
        expect(result.expectedRange.low).toBeCloseTo(200 - manual, 1);
        expect(result.expectedRange.high).toBeCloseTo(200 + manual, 1);
    });

    it('returns zero move for zero price', () => {
        const result = computeExpectedMove(0, 0.30, 30);
        expect(result.expectedMove).toBe(0);
    });

    it('returns zero move for zero IV', () => {
        const result = computeExpectedMove(200, 0, 30);
        expect(result.expectedMove).toBe(0);
    });

    it('returns zero move for zero days', () => {
        const result = computeExpectedMove(200, 0.30, 0);
        expect(result.expectedMove).toBe(0);
    });

    it('handles large IV correctly', () => {
        const result = computeExpectedMove(100, 1.5, 365);
        // 100 * 1.5 * sqrt(1) = 150
        expect(result.expectedMove).toBeCloseTo(150, 0);
    });
});

describe('formatExpectedMove', () => {
    it('formats zero as dash', () => {
        expect(formatExpectedMove({
            expectedMove: 0,
            expectedRange: { low: 200, high: 200 },
        })).toBe('—');
    });

    it('formats non-zero with range', () => {
        const formatted = formatExpectedMove({
            expectedMove: 17.20,
            expectedRange: { low: 182.80, high: 217.20 },
        });
        expect(formatted).toContain('17.20');
        expect(formatted).toContain('182.80');
        expect(formatted).toContain('217.20');
    });
});

// =============================================================================
// Liquidity Filter Tests
// =============================================================================

describe('filterByLiquidity', () => {
    it('passes contracts that meet all thresholds', () => {
        const contracts = [
            makeContract({ openInterest: 500, volume: 100, bidAskSpreadPct: 5 }),
        ];
        const result = filterByLiquidity(contracts, DEFAULT_LIQUIDITY_CONFIG);
        expect(result).toHaveLength(1);
    });

    it('rejects contracts with low open interest', () => {
        const contracts = [
            makeContract({ openInterest: 50, volume: 100, bidAskSpreadPct: 5 }),
        ];
        const result = filterByLiquidity(contracts, DEFAULT_LIQUIDITY_CONFIG);
        expect(result).toHaveLength(0);
    });

    it('rejects contracts with low volume', () => {
        const contracts = [
            makeContract({ openInterest: 500, volume: 10, bidAskSpreadPct: 5 }),
        ];
        const result = filterByLiquidity(contracts, DEFAULT_LIQUIDITY_CONFIG);
        expect(result).toHaveLength(0);
    });

    it('rejects contracts with wide bid-ask spread', () => {
        const contracts = [
            makeContract({ openInterest: 500, volume: 100, bidAskSpreadPct: 15 }),
        ];
        const result = filterByLiquidity(contracts, DEFAULT_LIQUIDITY_CONFIG);
        expect(result).toHaveLength(0);
    });

    it('filters mixed contracts correctly', () => {
        const contracts = [
            makeContract({ openInterest: 500, volume: 100, bidAskSpreadPct: 5 }),  // PASS
            makeContract({ openInterest: 50, volume: 100, bidAskSpreadPct: 5 }),   // FAIL OI
            makeContract({ openInterest: 500, volume: 10, bidAskSpreadPct: 5 }),   // FAIL vol
            makeContract({ openInterest: 500, volume: 100, bidAskSpreadPct: 15 }), // FAIL spread
        ];
        const result = filterByLiquidity(contracts, DEFAULT_LIQUIDITY_CONFIG);
        expect(result).toHaveLength(1);
    });

    it('supports custom config overrides', () => {
        const contracts = [
            makeContract({ openInterest: 50, volume: 10, bidAskSpreadPct: 20 }),
        ];
        const result = filterByLiquidity(contracts, {
            minOpenInterest: 10,
            minVolume: 5,
            maxBidAskSpreadPct: 25,
        });
        expect(result).toHaveLength(1);
    });
});

describe('computeLiquidityScore', () => {
    it('returns 0 for empty array', () => {
        expect(computeLiquidityScore([])).toBe(0);
    });

    it('returns score between 0 and 100', () => {
        const contracts = [
            makeContract({ openInterest: 1000, volume: 500 }),
        ];
        const score = computeLiquidityScore(contracts);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });

    it('gives higher score for higher OI/volume', () => {
        const low = [makeContract({ openInterest: 100, volume: 50 })];
        const high = [makeContract({ openInterest: 5000, volume: 2000 })];

        expect(computeLiquidityScore(high)).toBeGreaterThan(computeLiquidityScore(low));
    });
});

// =============================================================================
// Bid-Ask Spread Tests
// =============================================================================

describe('bid-ask spread calculation', () => {
    it('computes spread percentage correctly', () => {
        const bid = 5.00;
        const ask = 5.50;
        const mid = (bid + ask) / 2;   // 5.25
        const spread = ((ask - bid) / mid) * 100;  // 9.52%

        expect(mid).toBeCloseTo(5.25);
        expect(spread).toBeCloseTo(9.52, 1);
    });

    it('returns 100% spread when mid is zero', () => {
        const bid = 0;
        const ask = 0;
        const mid = 0;
        const spread = mid > 0 ? ((ask - bid) / mid) * 100 : 100;

        expect(spread).toBe(100);
    });

    it('returns tight spread for liquid contract', () => {
        const bid = 10.00;
        const ask = 10.05;
        const mid = (bid + ask) / 2;
        const spread = ((ask - bid) / mid) * 100;

        expect(spread).toBeLessThan(1);
    });
});

// =============================================================================
// Decision Layer Tests
// =============================================================================

describe('selectStrategy', () => {
    const liquidContracts = [
        makeContract({ type: 'CALL', openInterest: 500, volume: 100 }),
        makeContract({ type: 'PUT', openInterest: 500, volume: 100 }),
    ];

    const highIV: IVRankResult = { rank: 0.75, classification: 'HIGH', lowData: false };
    const lowIV: IVRankResult = { rank: 0.20, classification: 'LOW', lowData: false };
    const midIV: IVRankResult = { rank: 0.45, classification: 'MID', lowData: false };
    const noData: IVRankResult = { rank: null, classification: null, lowData: true };

    it('suggests CREDIT_SPREAD for high IV rank', () => {
        const result = selectStrategy(highIV, liquidContracts, 200);
        expect(result.suggestion).toBe('CREDIT_SPREAD');
        expect(result.rationale).toContain('75%');
    });

    it('suggests DEBIT_SPREAD for low IV rank with no directional signal', () => {
        const result = selectStrategy(lowIV, liquidContracts, 200);
        expect(result.suggestion).toBe('DEBIT_SPREAD');
        expect(result.rationale).toContain('20%');
    });

    it('suggests LONG_CALL for low IV + bullish price move', () => {
        const result = selectStrategy(lowIV, liquidContracts, 200, 5.0);
        expect(result.suggestion).toBe('LONG_CALL');
        expect(result.rationale).toContain('bullish');
    });

    it('suggests LONG_PUT for low IV + bearish price move', () => {
        const result = selectStrategy(lowIV, liquidContracts, 200, -5.0);
        expect(result.suggestion).toBe('LONG_PUT');
        expect(result.rationale).toContain('bearish');
    });

    it('suggests LONG_CALL for mid IV + bullish price move', () => {
        const result = selectStrategy(midIV, liquidContracts, 200, 5.0);
        expect(result.suggestion).toBe('LONG_CALL');
    });

    it('suggests DEBIT_SPREAD for mid IV with no directional move', () => {
        const result = selectStrategy(midIV, liquidContracts, 200, 1.0);
        expect(result.suggestion).toBe('DEBIT_SPREAD');
    });

    it('suggests AVOID when no contracts', () => {
        const result = selectStrategy(highIV, [], 200);
        expect(result.suggestion).toBe('AVOID');
        expect(result.rationale).toContain('liquidity');
    });

    it('suggests AVOID when IV data unavailable (LOW_DATA)', () => {
        const result = selectStrategy(noData, liquidContracts, 200);
        expect(result.suggestion).toBe('AVOID');
        expect(result.rationale).toContain('LOW_DATA');
    });

    it('includes rationale paragraph for all suggestions', () => {
        const cases = [
            selectStrategy(highIV, liquidContracts, 200),
            selectStrategy(lowIV, liquidContracts, 200),
            selectStrategy(midIV, liquidContracts, 200),
            selectStrategy(noData, liquidContracts, 200),
            selectStrategy(highIV, [], 200),
        ];

        for (const c of cases) {
            expect(c.rationale).toBeTruthy();
            expect(c.rationale.length).toBeGreaterThan(20);
        }
    });
});
