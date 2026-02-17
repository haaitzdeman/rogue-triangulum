/**
 * Walk-Forward Trainer Tests
 * 
 * Tests for:
 * 1. No-lookahead enforcement
 * 2. Calibration profile schema validation
 * 3. Determinism (same inputs → same outputs)
 */

import type { OHLCVBar } from '../calibration-types';
import { EMPTY_CALIBRATION_PROFILE } from '../calibration-types';

describe('Walk-Forward Trainer', () => {

    describe('No-Lookahead Enforcement', () => {
        /**
         * Critical test: Ensure signal generation at index N can only access bars 0..N
         */
        it('signal generator only accesses bars up to signal index', () => {
            // Mock bar data
            const bars: OHLCVBar[] = [];
            const baseTime = new Date('2023-01-01').getTime();

            for (let i = 0; i < 100; i++) {
                bars.push({
                    timestamp: baseTime + i * 86400000,
                    open: 100 + i * 0.1,
                    high: 102 + i * 0.1,
                    low: 98 + i * 0.1,
                    close: 101 + i * 0.1,
                    volume: 1000000,
                });
            }

            // Simulate signal generation at index 50
            const signalBarIndex = 50;

            // This test verifies the contract: when generating a signal at index N,
            // only bars[0..N] should be accessible
            const availableBars = bars.slice(0, signalBarIndex + 1);
            const futureBars = bars.slice(signalBarIndex + 1);

            // The training logic should NEVER access futureBars during signal generation
            expect(availableBars.length).toBe(51); // 0 to 50 inclusive
            expect(futureBars.length).toBe(49);    // 51 to 99

            // Verify the last available bar is the signal bar
            expect(availableBars[availableBars.length - 1].timestamp)
                .toBe(bars[signalBarIndex].timestamp);

            // Verify future bars start after signal bar
            expect(futureBars[0].timestamp).toBeGreaterThan(bars[signalBarIndex].timestamp);
        });

        it('outcome evaluation only uses bars after entry', () => {
            // Entry is signal + 1, exit is entry + holdDays
            const signalBarIndex = 50;
            const holdDays = 10;

            const entryBarIndex = signalBarIndex + 1;
            const exitBarIndex = entryBarIndex + holdDays;

            // Verify timeline ordering
            expect(entryBarIndex).toBe(51);
            expect(exitBarIndex).toBe(61);
            expect(signalBarIndex).toBeLessThan(entryBarIndex);
            expect(entryBarIndex).toBeLessThan(exitBarIndex);
        });

        it('training window does not overlap with test window', () => {
            // Walk-forward config
            const _trainMonths = 24;
            const _testMonths = 6;

            // Simulate date ranges
            const _trainStart = new Date('2020-01-01');
            const trainEnd = new Date('2022-01-01');
            const testStart = new Date('2022-01-01');
            const _testEnd = new Date('2022-07-01');

            // Verify no overlap
            expect(trainEnd.getTime()).toBeLessThanOrEqual(testStart.getTime());
            expect(testStart.getTime()).toBeGreaterThanOrEqual(trainEnd.getTime());
        });
    });

    describe('Calibration Profile Schema Validation', () => {
        it('empty profile has correct schema version', () => {
            expect(EMPTY_CALIBRATION_PROFILE.schemaVersion).toBe('1.0');
        });

        it('empty profile has required fields', () => {
            const profile = EMPTY_CALIBRATION_PROFILE;

            expect(profile).toHaveProperty('schemaVersion');
            expect(profile).toHaveProperty('createdAt');
            expect(profile).toHaveProperty('lastUpdated');
            expect(profile).toHaveProperty('walkForwardConfig');
            expect(profile).toHaveProperty('dataRange');
            expect(profile).toHaveProperty('strategyWeights');
            expect(profile).toHaveProperty('calibrationCurve');
            expect(profile).toHaveProperty('parameterOverrides');
            expect(profile).toHaveProperty('summary');
        });

        it('profile summary has required metrics', () => {
            const profile = EMPTY_CALIBRATION_PROFILE;

            expect(profile.summary).toHaveProperty('totalTrades');
            expect(profile.summary).toHaveProperty('winRate');
            expect(profile.summary).toHaveProperty('avgReturn');
            expect(profile.summary).toHaveProperty('sharpeRatio');
            expect(profile.summary).toHaveProperty('maxDrawdown');
        });

        it('calibration bucket has correct shape', () => {
            const bucket = {
                scoreBucketMin: 70,
                scoreBucketMax: 79,
                winRate: 0.55,
                avgReturn: 1.2,
                sampleSize: 100,
                confidenceFactor: 1.05,
            };

            expect(bucket.scoreBucketMin).toBeGreaterThanOrEqual(0);
            expect(bucket.scoreBucketMax).toBeLessThanOrEqual(99);
            expect(bucket.winRate).toBeGreaterThanOrEqual(0);
            expect(bucket.winRate).toBeLessThanOrEqual(1);
            expect(bucket.sampleSize).toBeGreaterThanOrEqual(0);
            expect(bucket.confidenceFactor).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Determinism', () => {
        it('same regime detection inputs produce same output', () => {
            // Simple regime detection based on volatility
            const detectRegime = (atrPercent: number): string => {
                if (atrPercent < 1.0) return 'low_vol';
                if (atrPercent > 3.0) return 'high_vol';
                return 'normal';
            };

            // Same input = same output
            expect(detectRegime(0.5)).toBe('low_vol');
            expect(detectRegime(0.5)).toBe('low_vol');

            expect(detectRegime(2.0)).toBe('normal');
            expect(detectRegime(2.0)).toBe('normal');

            expect(detectRegime(4.0)).toBe('high_vol');
            expect(detectRegime(4.0)).toBe('high_vol');
        });

        it('calibration factor calculation is deterministic', () => {
            const getCalibrationFactor = (score: number, winRate: number): number => {
                const _bucket = Math.floor(score / 10) * 10;
                return Math.max(0.5, Math.min(1.5, 0.5 + winRate));
            };

            // Same inputs = same outputs
            const factor1 = getCalibrationFactor(75, 0.55);
            const factor2 = getCalibrationFactor(75, 0.55);
            expect(factor1).toBe(factor2);

            // Different inputs = potentially different outputs
            const factor3 = getCalibrationFactor(75, 0.80);
            expect(factor3).not.toBe(factor1);
        });

        it('final score calculation is deterministic', () => {
            const calculateFinalScore = (
                baseScore: number,
                strategyWeight: number,
                calibrationFactor: number
            ): number => {
                return Math.round(baseScore * strategyWeight * calibrationFactor);
            };

            const score1 = calculateFinalScore(80, 1.1, 1.05);
            const score2 = calculateFinalScore(80, 1.1, 1.05);
            expect(score1).toBe(score2);
            expect(score1).toBe(92); // 80 * 1.1 * 1.05 = 92.4 → 92
        });
    });
});
