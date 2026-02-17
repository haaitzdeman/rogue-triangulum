/**
 * Analog Engine Tests
 * 
 * Tests for historical analog selection, outcome calculation, and confidence.
 */

import {
    detectRegime,
    buildAnalogDay,
    findHistoricalAnalogs,
    computeAnalogOutcomes,
    isLowConfidence,
    analyzeAnalogs,
} from '../analog-engine';
import type { HistoricalBar, AnalogConfig, RegimeTag } from '../premarket-types';
import { DEFAULT_ANALOG_CONFIG } from '../premarket-types';

describe('Analog Engine', () => {
    // Helper to create synthetic bars
    function createBars(count: number, basePrice = 100, volatility = 0.02): HistoricalBar[] {
        const bars: HistoricalBar[] = [];
        let price = basePrice;

        for (let i = 0; i < count; i++) {
            const date = new Date(2024, 0, i + 1);
            const change = (Math.random() - 0.5) * volatility * price;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);

            bars.push({
                date: date.toISOString().slice(0, 10),
                open,
                high,
                low,
                close,
                volume: 1000000,
            });

            price = close;
        }

        return bars;
    }

    describe('detectRegime', () => {
        it('returns normal for insufficient bars', () => {
            const bars = createBars(10);
            expect(detectRegime(bars)).toBe('normal');
        });

        it('returns a valid regime tag', () => {
            const bars = createBars(30);
            const regime = detectRegime(bars);
            expect(['low_vol', 'normal', 'high_vol']).toContain(regime);
        });
    });

    describe('buildAnalogDay', () => {
        it('builds analog day with correct gap calculation', () => {
            const prevBar: HistoricalBar = {
                date: '2024-01-01',
                open: 100,
                high: 102,
                low: 99,
                close: 100,
                volume: 1000000,
            };

            const currentBar: HistoricalBar = {
                date: '2024-01-02',
                open: 105, // 5% gap up
                high: 107, // MFE: +1.9%
                low: 103, // MAE: -1.9%
                close: 106, // Day return: +6%
                volume: 1000000,
            };

            const analogDay = buildAnalogDay(currentBar, prevBar, 'normal', 1.0);

            expect(analogDay.date).toBe('2024-01-02');
            expect(analogDay.gapPct).toBe(5); // (105-100)/100 * 100
            expect(analogDay.direction).toBe('UP');
            expect(analogDay.regime).toBe('normal');
            expect(analogDay.dayReturn).toBe(6); // (106-100)/100 * 100
        });

        it('calculates MFE correctly for gap up', () => {
            const prevBar: HistoricalBar = {
                date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000000
            };
            const currentBar: HistoricalBar = {
                date: '2024-01-02', open: 100, high: 103, low: 98, close: 101, volume: 1000000
            };

            const analogDay = buildAnalogDay(currentBar, prevBar, 'normal', 1.0);

            // MFE for gap up = (high - open) / open * 100 = (103 - 100) / 100 * 100 = 3%
            expect(analogDay.mfe).toBe(3);
        });

        it('calculates MAE correctly for gap up', () => {
            const prevBar: HistoricalBar = {
                date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000000
            };
            const currentBar: HistoricalBar = {
                date: '2024-01-02', open: 100, high: 103, low: 97, close: 101, volume: 1000000
            };

            const analogDay = buildAnalogDay(currentBar, prevBar, 'normal', 1.0);

            // MAE for gap up = (low - open) / open * 100 = (97 - 100) / 100 * 100 = -3%
            expect(analogDay.mae).toBe(-3);
        });
    });

    describe('findHistoricalAnalogs', () => {
        it('selects analogs within ±1% band and matching direction', () => {
            // Need 21+ bars for the function to work (regime detection requirement)
            // Create base bars with a known 5% gap up pattern at the end
            const bars: HistoricalBar[] = [];

            // First 20 bars for regime detection baseline
            for (let i = 0; i < 20; i++) {
                bars.push({
                    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
                    open: 100,
                    high: 101,
                    low: 99,
                    close: 100,
                    volume: 1000000,
                });
            }

            // 21st bar: 5% gap up from previous close of 100
            bars.push({
                date: '2024-01-21',
                open: 105,
                high: 107,
                low: 104,
                close: 106,
                volume: 1000000,
            });

            // Look for 5% gap up with ±1% band
            const analogs = findHistoricalAnalogs(bars, 5.0, 'UP', {
                ...DEFAULT_ANALOG_CONFIG,
                gapBandPct: 1.0,
            });

            // Should find the last bar as an analog
            expect(analogs.length).toBe(1);
            expect(analogs[0].direction).toBe('UP');
            expect(analogs[0].gapPct).toBeCloseTo(5, 1);
        });

        it('excludes analogs with opposite direction', () => {
            const bars: HistoricalBar[] = [
                { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000000 },
                { date: '2024-01-02', open: 95, high: 97, low: 94, close: 96, volume: 1000000 }, // -5% gap down
            ];

            const analogs = findHistoricalAnalogs(bars, 5.0, 'UP', DEFAULT_ANALOG_CONFIG);

            expect(analogs.length).toBe(0);
        });

        it('excludes analogs outside gap band', () => {
            const bars: HistoricalBar[] = [
                { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000000 },
                { date: '2024-01-02', open: 110, high: 112, low: 109, close: 111, volume: 1000000 }, // 10% gap (outside 5±1%)
            ];

            const analogs = findHistoricalAnalogs(bars, 5.0, 'UP', {
                ...DEFAULT_ANALOG_CONFIG,
                gapBandPct: 1.0,
            });

            expect(analogs.length).toBe(0);
        });
    });

    describe('computeAnalogOutcomes', () => {
        it('returns zero stats for empty analogs', () => {
            const stats = computeAnalogOutcomes([]);

            expect(stats.sampleSize).toBe(0);
            expect(stats.hitRate).toBe(0);
            expect(stats.avgMFE).toBe(0);
            expect(stats.avgMAE).toBe(0);
        });

        it('calculates correct hit rate', () => {
            const analogs = [
                { hitPlusR: true, mfe: 2, mae: -1, dayReturn: 1, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-01' },
                { hitPlusR: true, mfe: 3, mae: -0.5, dayReturn: 2, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-02' },
                { hitPlusR: false, mfe: 1, mae: -2, dayReturn: -1, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-03' },
                { hitPlusR: false, mfe: 0.5, mae: -3, dayReturn: -2, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-04' },
            ];

            const stats = computeAnalogOutcomes(analogs);

            expect(stats.sampleSize).toBe(4);
            expect(stats.hitRate).toBe(0.5); // 2/4
        });

        it('calculates correct avgMFE and avgMAE', () => {
            const analogs = [
                { hitPlusR: true, mfe: 2, mae: -1, dayReturn: 1, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-01' },
                { hitPlusR: true, mfe: 4, mae: -3, dayReturn: 2, regime: 'normal' as RegimeTag, gapPct: 5, direction: 'UP' as const, date: '2024-01-02' },
            ];

            const stats = computeAnalogOutcomes(analogs);

            expect(stats.avgMFE).toBe(3); // (2+4)/2
            expect(stats.avgMAE).toBe(-2); // (-1+-3)/2
        });
    });

    describe('isLowConfidence', () => {
        it('returns true when sample size < minSampleSize', () => {
            const stats = { sampleSize: 20, hitRate: 0.6, avgMFE: 2, avgMAE: -1, continuationPct: 1, regimeTag: 'normal' as RegimeTag };
            const config = { ...DEFAULT_ANALOG_CONFIG, minSampleSize: 30 };

            expect(isLowConfidence(stats, config)).toBe(true);
        });

        it('returns false when sample size >= minSampleSize', () => {
            const stats = { sampleSize: 50, hitRate: 0.6, avgMFE: 2, avgMAE: -1, continuationPct: 1, regimeTag: 'normal' as RegimeTag };
            const config = { ...DEFAULT_ANALOG_CONFIG, minSampleSize: 30 };

            expect(isLowConfidence(stats, config)).toBe(false);
        });
    });

    describe('analyzeAnalogs', () => {
        it('returns lowConfidence=true when sample < threshold', () => {
            const bars = createBars(50);
            const config: AnalogConfig = { ...DEFAULT_ANALOG_CONFIG, minSampleSize: 1000 }; // Very high threshold

            const { lowConfidence } = analyzeAnalogs(bars, 5.0, 'UP', config);

            expect(lowConfidence).toBe(true);
        });

        it('returns stats even with low sample size', () => {
            const bars = createBars(100);

            const { stats, lowConfidence: _lowConfidence } = analyzeAnalogs(bars, 2.0, 'UP', {
                ...DEFAULT_ANALOG_CONFIG,
                gapBandPct: 5.0, // Wider band to catch more
            });

            // Should still compute stats
            expect(typeof stats.sampleSize).toBe('number');
            expect(typeof stats.hitRate).toBe('number');
        });
    });
});
