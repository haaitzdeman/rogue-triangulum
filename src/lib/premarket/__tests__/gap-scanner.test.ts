/**
 * Gap Scanner Tests
 * 
 * Tests for premarket gap calculation, filtering, and sorting.
 */

import {
    computeGapPct,
    getGapDirection,
    isETF,
    filterGapData,
    sortGapCandidates,
    buildGapData,
    scanGaps,
} from '../gap-scanner';
import type { GapData, GapScannerConfig } from '../premarket-types';
import { DEFAULT_GAP_SCANNER_CONFIG } from '../premarket-types';

describe('Gap Scanner', () => {
    describe('computeGapPct', () => {
        it('correctly calculates positive gap (+5%)', () => {
            const prevClose = 100;
            const currentPrice = 105;
            const gapPct = computeGapPct(prevClose, currentPrice);
            expect(gapPct).toBe(5);
        });

        it('correctly calculates negative gap (-3%)', () => {
            const prevClose = 100;
            const currentPrice = 97;
            const gapPct = computeGapPct(prevClose, currentPrice);
            expect(gapPct).toBe(-3);
        });

        it('correctly calculates zero gap (0%)', () => {
            const prevClose = 100;
            const currentPrice = 100;
            const gapPct = computeGapPct(prevClose, currentPrice);
            expect(gapPct).toBe(0);
        });

        it('handles zero prevClose gracefully', () => {
            const gapPct = computeGapPct(0, 100);
            expect(gapPct).toBe(0);
        });

        it('calculates fractional gaps correctly', () => {
            const prevClose = 100;
            const currentPrice = 103.5;
            const gapPct = computeGapPct(prevClose, currentPrice);
            expect(gapPct).toBeCloseTo(3.5, 5);
        });
    });

    describe('getGapDirection', () => {
        it('returns UP for positive gap', () => {
            expect(getGapDirection(5)).toBe('UP');
        });

        it('returns DOWN for negative gap', () => {
            expect(getGapDirection(-3)).toBe('DOWN');
        });

        it('returns UP for zero gap', () => {
            expect(getGapDirection(0)).toBe('UP');
        });
    });

    describe('isETF', () => {
        it('identifies SPY as ETF', () => {
            expect(isETF('SPY')).toBe(true);
        });

        it('identifies QQQ as ETF', () => {
            expect(isETF('QQQ')).toBe(true);
        });

        it('identifies AAPL as not ETF', () => {
            expect(isETF('AAPL')).toBe(false);
        });

        it('handles lowercase input', () => {
            expect(isETF('spy')).toBe(true);
        });
    });

    describe('filterGapData', () => {
        const baseGapData: GapData = {
            symbol: 'AAPL',
            prevClose: 100,
            gapReferencePrice: 105,
            gapPct: 5,
            avgDailyVolume20: 50000000,
            currentPrice: 105,
            dataMode: 'OPEN_FALLBACK',
        };

        it('passes candidate meeting all criteria', () => {
            expect(filterGapData(baseGapData)).toBe(true);
        });

        it('filters out candidate with gap below minAbsGapPct', () => {
            const lowGap = { ...baseGapData, gapPct: 2 }; // Below default 3%
            expect(filterGapData(lowGap)).toBe(false);
        });

        it('filters out candidate with price below minPrice', () => {
            const lowPrice = { ...baseGapData, currentPrice: 2 }; // Below default $3
            expect(filterGapData(lowPrice)).toBe(false);
        });

        it('filters out candidate with volume below minAvgDailyVolume20', () => {
            const lowVolume = { ...baseGapData, avgDailyVolume20: 500000 }; // Below 1M
            expect(filterGapData(lowVolume)).toBe(false);
        });

        it('filters out ETF when excludeETFs is true', () => {
            const etf: GapData = { ...baseGapData, symbol: 'SPY' };
            const config: GapScannerConfig = { ...DEFAULT_GAP_SCANNER_CONFIG, excludeETFs: true };
            expect(filterGapData(etf, config)).toBe(false);
        });

        it('allows ETF when excludeETFs is false', () => {
            const etf: GapData = { ...baseGapData, symbol: 'SPY' };
            expect(filterGapData(etf)).toBe(true);
        });
    });

    describe('sortGapCandidates', () => {
        it('sorts by absolute gap percentage descending', () => {
            const candidates: GapData[] = [
                { symbol: 'A', gapPct: 3, avgDailyVolume20: 1000000 } as GapData,
                { symbol: 'B', gapPct: -5, avgDailyVolume20: 1000000 } as GapData,
                { symbol: 'C', gapPct: 4, avgDailyVolume20: 1000000 } as GapData,
            ];

            const sorted = sortGapCandidates(candidates);

            expect(sorted[0].symbol).toBe('B'); // |−5| = 5
            expect(sorted[1].symbol).toBe('C'); // |4| = 4
            expect(sorted[2].symbol).toBe('A'); // |3| = 3
        });

        it('uses volume as secondary sort when gaps are equal', () => {
            const candidates: GapData[] = [
                { symbol: 'A', gapPct: 5, avgDailyVolume20: 1000000 } as GapData,
                { symbol: 'B', gapPct: 5, avgDailyVolume20: 5000000 } as GapData,
                { symbol: 'C', gapPct: 5, avgDailyVolume20: 2000000 } as GapData,
            ];

            const sorted = sortGapCandidates(candidates);

            expect(sorted[0].symbol).toBe('B'); // Highest volume
            expect(sorted[1].symbol).toBe('C');
            expect(sorted[2].symbol).toBe('A'); // Lowest volume
        });
    });

    describe('buildGapData', () => {
        it('builds gap data with computed gapPct', () => {
            const data = buildGapData(
                'AAPL',
                100,
                105,
                50000000,
                'OPEN_FALLBACK'
            );

            expect(data.symbol).toBe('AAPL');
            expect(data.gapPct).toBe(5);
            expect(data.prevClose).toBe(100);
            expect(data.gapReferencePrice).toBe(105);
            expect(data.dataMode).toBe('OPEN_FALLBACK');
        });

        it('rounds gapPct to 2 decimal places', () => {
            const data = buildGapData('TEST', 100, 103.333, 1000000, 'OPEN_FALLBACK');
            expect(data.gapPct).toBe(3.33);
        });
    });

    describe('scanGaps', () => {
        it('filters and sorts candidates correctly', () => {
            const allData: GapData[] = [
                { symbol: 'A', gapPct: 2, currentPrice: 100, avgDailyVolume20: 5000000 } as GapData, // Filtered (gap < 3%)
                { symbol: 'B', gapPct: 5, currentPrice: 100, avgDailyVolume20: 5000000 } as GapData, // Keep
                { symbol: 'C', gapPct: -4, currentPrice: 100, avgDailyVolume20: 5000000 } as GapData, // Keep
                { symbol: 'D', gapPct: 3, currentPrice: 2, avgDailyVolume20: 5000000 } as GapData, // Filtered (price < $3)
            ];

            const result = scanGaps(allData);

            expect(result.length).toBe(2);
            expect(result[0].symbol).toBe('B'); // |5| > |−4|
            expect(result[1].symbol).toBe('C');
        });
    });
});
