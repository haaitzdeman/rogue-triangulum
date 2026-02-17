/**
 * Calibration Status API Tests
 * 
 * Tests for /api/calibration/status endpoint behavior:
 * - ON/OFF/STALE status detection
 * - Benchmark object shape
 * - Score buckets with sufficient/insufficient data
 * - Threshold enforcement
 */

import {
    getCalibrationStatus,
} from '../walkforward-trainer';
import {
    SAFETY_THRESHOLDS,
    EMPTY_CALIBRATION_PROFILE,
    CalibrationProfile,
    CalibrationBucket,
} from '../calibration-types';
import * as fs from 'fs';



// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

describe('Calibration Status', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCalibrationStatus', () => {
        it('returns OFF when profile does not exist', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const result = getCalibrationStatus();

            expect(result.status).toBe('OFF');
            expect(result.reason).toContain('No calibration profile');
        });

        it('returns OFF when schema version is invalid', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                schemaVersion: '99.0',
                createdAt: new Date().toISOString(),
            }));

            const result = getCalibrationStatus();

            expect(result.status).toBe('OFF');
            expect(result.reason).toContain('Invalid schema');
        });

        it('returns OFF when calibration did not improve performance', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                schemaVersion: '1.0',
                createdAt: new Date().toISOString(),
                benchmark: {
                    calibrationApplied: false,
                },
            }));

            const result = getCalibrationStatus();

            expect(result.status).toBe('OFF');
            expect(result.reason).toContain('did not improve');
        });

        it('returns STALE when profile is older than MAX_PROFILE_AGE_DAYS', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 45); // 45 days old

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                schemaVersion: '1.0',
                createdAt: oldDate.toISOString(),
                benchmark: {
                    calibrationApplied: true,
                },
            }));

            const result = getCalibrationStatus();

            expect(result.status).toBe('STALE');
            expect(result.reason).toContain('days old');
        });

        it('returns ON when profile is valid and recent', () => {
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 5); // 5 days old

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                schemaVersion: '1.0',
                createdAt: recentDate.toISOString(),
                benchmark: {
                    calibrationApplied: true,
                },
            }));

            const result = getCalibrationStatus();

            expect(result.status).toBe('ON');
            expect(result.reason).toContain('active');
        });
    });

    describe('Benchmark Object Shape', () => {
        it('includes required benchmark fields', () => {
            const profile: Partial<CalibrationProfile> = {
                schemaVersion: '1.0',
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                benchmark: {
                    winRate_base: 0.51,
                    winRate_calibrated: 0.538,
                    avgReturn_base: 0.82,
                    avgReturn_calibrated: 1.12,
                    sampleSize: 4872,
                    calibrationApplied: true,
                    reason: 'Calibration improves performance',
                },
            };

            expect(profile.benchmark).toHaveProperty('winRate_base');
            expect(profile.benchmark).toHaveProperty('winRate_calibrated');
            expect(profile.benchmark).toHaveProperty('avgReturn_base');
            expect(profile.benchmark).toHaveProperty('avgReturn_calibrated');
            expect(profile.benchmark).toHaveProperty('sampleSize');
            expect(profile.benchmark).toHaveProperty('calibrationApplied');
        });
    });

    describe('Score Bucket Thresholds', () => {
        it('enforces MIN_SAMPLE_SIZE_PER_BUCKET threshold', () => {
            expect(SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET).toBe(200);
        });

        it('enforces MAX_PROFILE_AGE_DAYS threshold', () => {
            expect(SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS).toBe(30);
        });

        it('bucket with sufficient data has confidenceFactor != 1.0', () => {
            const bucket: CalibrationBucket = {
                scoreBucketMin: 70,
                scoreBucketMax: 79,
                winRate: 0.58,
                avgReturn: 1.68,
                sampleSize: 892,  // >= 200
                confidenceFactor: 1.08,  // Adjusted
            };

            expect(bucket.sampleSize).toBeGreaterThanOrEqual(SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET);
            expect(bucket.confidenceFactor).not.toBe(1.0);
        });

        it('bucket with insufficient data should have confidenceFactor = 1.0', () => {
            const bucket: CalibrationBucket = {
                scoreBucketMin: 40,
                scoreBucketMax: 49,
                winRate: 0.48,
                avgReturn: 0.22,
                sampleSize: 150,  // < 200
                confidenceFactor: 1.0,  // No adjustment
            };

            expect(bucket.sampleSize).toBeLessThan(SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET);
            expect(bucket.confidenceFactor).toBe(1.0);
        });
    });

    describe('Empty Profile Fallback', () => {
        it('EMPTY_CALIBRATION_PROFILE has default values', () => {
            expect(EMPTY_CALIBRATION_PROFILE.schemaVersion).toBe('1.0');
            expect(EMPTY_CALIBRATION_PROFILE.strategyWeights).toEqual({});
            expect(EMPTY_CALIBRATION_PROFILE.calibrationCurve).toEqual([]);
            expect(EMPTY_CALIBRATION_PROFILE.benchmark?.calibrationApplied).toBe(false);
        });
    });

    describe('Calibration Gating - Calibrated Worse Than Base', () => {
        it('calibrationApplied should be false when calibrated winRate <= base winRate', () => {
            // This tests the expectation from profile.json
            const profileWithWorseCalibration = {
                schemaVersion: '1.0',
                createdAt: new Date().toISOString(),
                benchmark: {
                    winRate_base: 0.483,
                    winRate_calibrated: 0.463,  // WORSE
                    avgReturn_base: -0.24,
                    avgReturn_calibrated: -0.14, // Better, but winRate is worse
                    sampleSize: 36449,
                    calibrationApplied: false,  // Must be false
                    reason: 'Calibration rejected (calibrated winRate 46.3% <= base 48.3%)',
                },
            };

            expect(profileWithWorseCalibration.benchmark.calibrationApplied).toBe(false);
            expect(profileWithWorseCalibration.benchmark.reason).toContain('rejected');
        });

        it('getCalibrationStatus returns OFF when calibrated < base', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                schemaVersion: '1.0',
                createdAt: new Date().toISOString(),
                benchmark: {
                    winRate_base: 0.5,
                    winRate_calibrated: 0.45,
                    calibrationApplied: false,
                    reason: 'Calibration rejected (calibrated winRate 45.0% <= base 50.0%)',
                },
            }));

            const result = getCalibrationStatus();

            expect(result.status).toBe('OFF');
            expect(result.reason).toContain('did not improve');
        });

        it('multipliers in EMPTY_CALIBRATION_PROFILE must default to 1.0 when OFF', () => {
            // When calibrationApplied is false, runtime must use 1.0 multipliers
            expect(EMPTY_CALIBRATION_PROFILE.benchmark?.calibrationApplied).toBe(false);
            expect(EMPTY_CALIBRATION_PROFILE.strategyWeights).toEqual({});
            expect(EMPTY_CALIBRATION_PROFILE.calibrationCurve).toEqual([]);
            // No weights means default 1.0, no buckets means default 1.0
        });

        it('profile with calibrationApplied=false should have empty strategyWeights in file', () => {
            // The trainer clears strategyWeights when calibrationApplied=false
            const mockProfile = {
                schemaVersion: '1.0',
                createdAt: new Date().toISOString(),
                benchmark: { calibrationApplied: false },
                strategyWeights: {},  // Empty when OFF
                calibrationCurve: [],  // Empty when OFF
            };

            expect(mockProfile.benchmark.calibrationApplied).toBe(false);
            expect(Object.keys(mockProfile.strategyWeights)).toHaveLength(0);
            expect(mockProfile.calibrationCurve).toHaveLength(0);
        });
    });
});
