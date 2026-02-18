export const dynamic = 'force-dynamic';

/**
 * Calibration Status API
 * 
 * Returns calibration status and comparison data for Signal Journal UI.
 * GET /api/calibration/status
 * 
 * ## Response Schema
 * 
 * ### Status Values
 * - `ON`: Calibration profile loaded and applied
 * - `OFF`: No profile, invalid schema, or calibration did not improve performance
 * - `STALE`: Profile exists but is older than MAX_PROFILE_AGE_DAYS (30 days)
 * 
 * ### Win Rate Definitions
 * - `baseWinRate`: Win rate using raw strategy scores only (no calibration applied)
 * - `calibratedWinRate`: Win rate after applying strategy weights and calibration factors
 * - `expectedWinRate`: Historical win rate for a score bucket from calibration profile
 * - `realizedWinRate`: Actual win rate observed in Signal Journal for that bucket
 * - `drift`: Difference between realized and expected (realizedWinRate - expectedWinRate)
 *   - Only calculated when sampleSize >= MIN_SAMPLE_SIZE_PER_BUCKET (200)
 *   - null when insufficient samples
 * 
 * ### Benchmark Object
 * Compares base vs calibrated performance on historical walk-forward data.
 * calibrationApplied = true only if calibrated metrics beat base metrics.
 */

import { NextResponse } from 'next/server';
import { getCalibrationStatus, loadCalibrationProfile } from '@/lib/training/walkforward-trainer';
import type { CalibrationProfile, BenchmarkComparison } from '@/lib/training/calibration-types';
import { SAFETY_THRESHOLDS } from '@/lib/training/calibration-types';

/**
 * Score bucket with expected and realized win rates
 */
interface ScoreBucketComparison {
    /** Score range, e.g. "70-79" */
    bucket: string;

    /** Expected win rate from calibration profile (historical) */
    expectedWinRate: number;

    /** Sample size from historical calibration data */
    calibrationSampleSize: number;

    /** Realized win rate from Signal Journal (actual outcomes) */
    realizedWinRate?: number;

    /** Sample size of realized outcomes */
    realizedSampleSize?: number;

    /** 
     * Drift = realizedWinRate - expectedWinRate
     * null when sample size < MIN_SAMPLE_SIZE_PER_BUCKET (200)
     */
    drift: number | null;

    /** 
     * Note explaining null drift
     * Present only when drift is null due to insufficient samples
     */
    insufficientDataNote?: string;
}

/**
 * Full calibration status response
 */
interface CalibrationStatusResponse {
    /** Calibration state: ON, OFF, or STALE */
    status: 'ON' | 'OFF' | 'STALE';

    /** Human-readable reason for current status */
    reason: string;

    /** Profile metadata (null when status=OFF) */
    profile: {
        createdAt: string;
        dataRange: CalibrationProfile['dataRange'];
        benchmark: BenchmarkComparison | null;
    } | null;

    /** Score bucket comparisons with expected vs realized */
    scoreBuckets: ScoreBucketComparison[];

    /** Safety threshold constants for reference */
    thresholds: {
        minSampleSizePerBucket: number;
        maxProfileAgeDays: number;
    };
}

export async function GET() {
    try {
        const { status, reason } = getCalibrationStatus();

        // Return minimal response when calibration is OFF
        if (status === 'OFF') {
            return NextResponse.json<CalibrationStatusResponse>({
                status,
                reason,
                profile: null,
                scoreBuckets: [],
                thresholds: {
                    minSampleSizePerBucket: SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET,
                    maxProfileAgeDays: SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS,
                },
            });
        }

        const profile = loadCalibrationProfile();

        // Fetch realized win rates from journal
        const realizedStats = await fetchRealizedStats();

        // Build score bucket comparisons with drift calculation
        const scoreBuckets: ScoreBucketComparison[] = profile.calibrationCurve.map(bucket => {
            const bucketKey = `${bucket.scoreBucketMin}-${bucket.scoreBucketMax}`;
            const realized = realizedStats[bucketKey];

            const hasEnoughCalibrationSamples = bucket.sampleSize >= SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET;
            const hasEnoughRealizedSamples = realized && realized.count >= SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET;

            // Calculate drift only when BOTH have enough samples
            let drift: number | null = null;
            let realizedWinRate: number | undefined;
            let realizedSampleSize: number | undefined;

            if (realized) {
                realizedWinRate = realized.hitTargetRate;
                realizedSampleSize = realized.count;

                if (hasEnoughCalibrationSamples && hasEnoughRealizedSamples) {
                    drift = realizedWinRate - bucket.winRate;
                }
            }

            return {
                bucket: bucketKey,
                expectedWinRate: bucket.winRate,
                calibrationSampleSize: bucket.sampleSize,
                realizedWinRate,
                realizedSampleSize,
                drift,
                insufficientDataNote: (!hasEnoughCalibrationSamples || !hasEnoughRealizedSamples)
                    ? `Insufficient sample (<${SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET})`
                    : undefined,
            };
        });

        return NextResponse.json<CalibrationStatusResponse>({
            status,
            reason,
            profile: {
                createdAt: profile.createdAt,
                dataRange: profile.dataRange,
                benchmark: profile.benchmark || null,
            },
            scoreBuckets,
            thresholds: {
                minSampleSizePerBucket: SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET,
                maxProfileAgeDays: SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS,
            },
        });
    } catch (error) {
        console.error('[API/calibration/status] Error:', error);
        return NextResponse.json<CalibrationStatusResponse>({
            status: 'OFF',
            reason: 'Error loading calibration status',
            profile: null,
            scoreBuckets: [],
            thresholds: {
                minSampleSizePerBucket: SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET,
                maxProfileAgeDays: SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS,
            },
        });
    }
}

/**
 * Fetch realized stats per score bucket from journal
 */
async function fetchRealizedStats(): Promise<Record<string, { count: number; hitTargetRate: number }>> {
    try {
        // Call the journal API internally
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/journal?status=evaluated`);
        const data = await response.json();

        if (data.success && data.stats?.byScoreBucket) {
            return data.stats.byScoreBucket;
        }
        return {};
    } catch {
        console.warn('[API/calibration/status] Could not fetch journal stats');
        return {};
    }
}

