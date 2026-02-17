/**
 * Calibration Loader
 * 
 * Runtime access to calibration profile for ranking adjustments.
 * Provides strategy weights and calibration factors.
 * 
 * Server-side only.
 */

import { loadCalibrationProfile } from './walkforward-trainer';
import type { CalibrationProfile, CalibratedCandidate } from './calibration-types';

// Cached profile
let cachedProfile: CalibrationProfile | null = null;
let cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Get calibration profile (cached)
 */
export function getCalibrationProfile(): CalibrationProfile {
    const now = Date.now();
    if (!cachedProfile || now - cacheLoadedAt > CACHE_TTL_MS) {
        cachedProfile = loadCalibrationProfile();
        cacheLoadedAt = now;
    }
    return cachedProfile;
}

/**
 * Get strategy weight for a regime
 */
export function getStrategyWeight(strategyName: string, regime: string): number {
    const profile = getCalibrationProfile();

    // GATING: If calibration is OFF, return 1.0
    if (!profile.benchmark?.calibrationApplied) return 1.0;

    const strategyWeights = profile.strategyWeights[strategyName];
    if (!strategyWeights) return 1.0; // Default weight

    const weight = strategyWeights[regime];
    if (weight === undefined) return 1.0;

    return weight;
}

/**
 * Get calibration factor for a score
 */
export function getCalibrationFactor(score: number): number {
    const profile = getCalibrationProfile();

    // GATING: If calibration is OFF, return 1.0
    if (!profile.benchmark?.calibrationApplied) return 1.0;

    const bucket = Math.floor(score / 10) * 10;
    const clampedBucket = Math.max(0, Math.min(90, bucket));

    const bucketData = profile.calibrationCurve.find(
        b => b.scoreBucketMin <= clampedBucket && b.scoreBucketMax >= clampedBucket
    );

    if (!bucketData) return 1.0;

    return bucketData.confidenceFactor;
}

/**
 * Apply calibration to a candidate and generate explanation
 */
export function applyCalibrаtion(candidate: {
    symbol: string;
    baseScore: number;
    strategyName: string;
    regime: string;
}): CalibratedCandidate {
    const profile = getCalibrationProfile();
    const isCalibrationActive = profile.benchmark?.calibrationApplied ?? false;

    const strategyWeight = getStrategyWeight(candidate.strategyName, candidate.regime);
    const calibrationFactor = getCalibrationFactor(candidate.baseScore);
    const finalScore = Math.round(candidate.baseScore * strategyWeight * calibrationFactor);

    const hasProfile = profile.dataRange.totalSignals > 0;

    // Explanation varies based on whether calibration is active
    const calibrationOff = hasProfile && !isCalibrationActive;

    return {
        symbol: candidate.symbol,
        baseScore: candidate.baseScore,
        strategyName: candidate.strategyName,
        regime: candidate.regime,
        strategyWeight,
        calibrationFactor,
        finalScore,
        explanation: {
            baseScoreReason: `Strategy "${candidate.strategyName}" generated base score of ${candidate.baseScore}`,
            weightReason: calibrationOff
                ? `Calibration OFF: weight=1.0x (calibrated winRate did not improve over base)`
                : hasProfile
                    ? `Strategy weight for "${candidate.regime}" regime: ${strategyWeight.toFixed(2)}x (based on ${profile.dataRange.totalSignals} historical signals)`
                    : `Default weight: 1.0x (no calibration profile)`,
            calibrationReason: calibrationOff
                ? `Calibration OFF: factor=1.0x (calibrated winRate did not improve over base)`
                : hasProfile
                    ? `Score bucket ${Math.floor(candidate.baseScore / 10) * 10}-${Math.floor(candidate.baseScore / 10) * 10 + 9} calibration factor: ${calibrationFactor.toFixed(2)}x`
                    : `Default calibration: 1.0x (no calibration profile)`,
            finalScoreReason: `Final = ${candidate.baseScore} × ${strategyWeight.toFixed(2)} × ${calibrationFactor.toFixed(2)} = ${finalScore}`,
        },
    };
}


/**
 * Clear cached profile (for testing)
 */
export function clearProfileCache(): void {
    cachedProfile = null;
    cacheLoadedAt = 0;
}

/**
 * Check if calibration profile exists
 */
export function hasCalibrationProfile(): boolean {
    const profile = getCalibrationProfile();
    return profile.dataRange.totalSignals > 0;
}
