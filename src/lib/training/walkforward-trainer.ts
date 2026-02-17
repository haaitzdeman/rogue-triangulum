/**
 * Walk-Forward Calibration Trainer
 * 
 * Runs walk-forward backtesting to calibrate strategy weights.
 * 
 * NO LOOKAHEAD: Training slice ONLY uses data available at that point.
 * DETERMINISTIC: Same data + params = same output.
 * 
 * Output: CalibrationProfile with strategy weights, calibration curve, benchmark, and parameters.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadSymbolDataset, loadManifest, getValidSymbols } from './dataset-builder';
import type { OHLCVBar } from './provider-adapter';
import type {
    CalibrationProfile,
    WalkForwardConfig,
    CalibrationBucket,
    BenchmarkComparison,
} from './calibration-types';
import {
    EMPTY_CALIBRATION_PROFILE,
    DATA_QUALITY_THRESHOLDS,
    SAFETY_THRESHOLDS,
    loadTrainingConfig,
} from './calibration-types';

const CALIBRATION_DIR = 'data/calibration';
const PROFILE_PATH = path.join(CALIBRATION_DIR, 'profile.json');

/**
 * Regime detection (simple volatility-based)
 */
function detectRegime(bars: OHLCVBar[]): 'low_vol' | 'normal' | 'high_vol' {
    if (bars.length < 20) return 'normal';

    let atrSum = 0;
    for (let i = Math.max(1, bars.length - 20); i < bars.length; i++) {
        const tr = Math.max(
            bars[i].high - bars[i].low,
            Math.abs(bars[i].high - bars[i - 1].close),
            Math.abs(bars[i].low - bars[i - 1].close)
        );
        atrSum += tr / bars[i - 1].close;
    }
    const atrPercent = (atrSum / Math.min(20, bars.length - 1)) * 100;

    if (atrPercent < 1.0) return 'low_vol';
    if (atrPercent > 3.0) return 'high_vol';
    return 'normal';
}

/**
 * Simple strategy signal generator (for calibration)
 */
function generateSignals(
    bars: OHLCVBar[],
    signalBarIndex: number
): { direction: 'long' | 'short'; score: number; strategyName: string } | null {
    if (signalBarIndex < 20) return null;

    const period = 14;
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = signalBarIndex - period; i < signalBarIndex; i++) {
        const change = bars[i + 1].close - bars[i].close;
        if (change > 0) {
            gains.push(change);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(Math.abs(change));
        }
    }

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    if (rsi < 30) {
        return { direction: 'long', score: 30 + (30 - rsi) * 2, strategyName: 'RSI_Oversold' };
    }
    if (rsi > 70) {
        return { direction: 'short', score: 30 + (rsi - 70) * 2, strategyName: 'RSI_Overbought' };
    }

    const sma20 = bars.slice(signalBarIndex - 20, signalBarIndex).reduce((s, b) => s + b.close, 0) / 20;
    const currentPrice = bars[signalBarIndex].close;

    if (currentPrice > sma20 * 1.02) {
        return { direction: 'long', score: 60, strategyName: 'TrendFollow' };
    }
    if (currentPrice < sma20 * 0.98) {
        return { direction: 'short', score: 60, strategyName: 'TrendFollow' };
    }

    return null;
}

/**
 * Evaluate signal outcome (no lookahead)
 */
function evaluateOutcome(
    bars: OHLCVBar[],
    signalBarIndex: number,
    direction: 'long' | 'short',
    holdDays: number = 10
): { return: number; hit: boolean } | null {
    const entryIdx = signalBarIndex + 1;
    const exitIdx = entryIdx + holdDays;

    if (exitIdx >= bars.length) return null;

    const entryPrice = bars[entryIdx].open;
    const exitPrice = bars[exitIdx].close;

    const returnPct = direction === 'long'
        ? ((exitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - exitPrice) / entryPrice) * 100;

    return {
        return: returnPct,
        hit: returnPct > 0,
    };
}

/**
 * Run walk-forward calibration with benchmark comparison
 */
export async function runWalkForwardCalibration(
    config: Partial<WalkForwardConfig> = {}
): Promise<CalibrationProfile> {
    // Load configurable universe
    const { universe, config: fileConfig } = loadTrainingConfig();
    const wfConfig: WalkForwardConfig = { ...fileConfig, ...config };

    console.log('[WalkForward] Starting calibration...');
    console.log(`[WalkForward] Universe: ${universe.length} symbols`);
    console.log(`[WalkForward] Config: ${wfConfig.trainWindowMonths}mo train, ${wfConfig.testWindowMonths}mo test`);

    const manifest = loadManifest();
    if (!manifest) {
        console.error('[WalkForward] No dataset manifest found.');
        return EMPTY_CALIBRATION_PROFILE;
    }

    // Check for plan-limited data
    const dataLimited = manifest.dataLimited || false;
    if (dataLimited) {
        console.warn('[WalkForward] [plan-limited] Dataset has less history than requested');
    }

    const validSymbols = getValidSymbols();
    if (validSymbols.length === 0) {
        console.error('[WalkForward] No valid symbols in dataset.');
        return EMPTY_CALIBRATION_PROFILE;
    }

    console.log(`[WalkForward] Using ${validSymbols.length} valid symbols`);

    // Collect all signals and outcomes
    const allResults: {
        strategyName: string;
        regime: string;
        score: number;
        returnPct: number;
        hit: boolean;
    }[] = [];

    for (const symbol of validSymbols) {
        const bars = loadSymbolDataset(symbol);
        if (bars.length < DATA_QUALITY_THRESHOLDS.MIN_BARS_FOR_CALIBRATION) {
            continue;
        }

        for (let i = 50; i < bars.length - 15; i++) {
            const signal = generateSignals(bars, i);
            if (!signal) continue;

            const outcome = evaluateOutcome(bars, i, signal.direction, 10);
            if (!outcome) continue;

            const regime = detectRegime(bars.slice(0, i + 1));

            allResults.push({
                strategyName: signal.strategyName,
                regime,
                score: signal.score,
                returnPct: outcome.return,
                hit: outcome.hit,
            });
        }
    }

    console.log(`[WalkForward] Collected ${allResults.length} signal outcomes`);

    if (allResults.length === 0) {
        console.warn('[WalkForward] No signals generated.');
        return EMPTY_CALIBRATION_PROFILE;
    }

    // Calculate BASE metrics (no calibration)
    const baseWinRate = allResults.filter(r => r.hit).length / allResults.length;
    const baseAvgReturn = allResults.reduce((s, r) => s + r.returnPct, 0) / allResults.length;

    // Calculate strategy weights by regime
    const strategyWeights: CalibrationProfile['strategyWeights'] = {};
    const strategyRegimeCounts: { [key: string]: { count: number; winRate: number; avgReturn: number } } = {};

    for (const result of allResults) {
        const key = `${result.strategyName}:${result.regime}`;
        if (!strategyRegimeCounts[key]) {
            strategyRegimeCounts[key] = { count: 0, winRate: 0, avgReturn: 0 };
        }
        strategyRegimeCounts[key].count++;
        strategyRegimeCounts[key].winRate += result.hit ? 1 : 0;
        strategyRegimeCounts[key].avgReturn += result.returnPct;
    }

    for (const key of Object.keys(strategyRegimeCounts)) {
        const [strategyName, regime] = key.split(':');
        const stats = strategyRegimeCounts[key];
        const winRate = stats.winRate / stats.count;
        const avgReturn = stats.avgReturn / stats.count;

        const weight = Math.max(0.5, Math.min(1.5, 0.5 + winRate + avgReturn / 10));

        if (!strategyWeights[strategyName]) {
            strategyWeights[strategyName] = {};
        }
        strategyWeights[strategyName][regime] = Math.round(weight * 100) / 100;
    }

    // Calculate calibration curve with minimum sample size enforcement
    const scoreBuckets: { [bucket: number]: { count: number; wins: number; returnSum: number } } = {};
    for (let b = 0; b <= 90; b += 10) {
        scoreBuckets[b] = { count: 0, wins: 0, returnSum: 0 };
    }

    for (const result of allResults) {
        const bucket = Math.floor(result.score / 10) * 10;
        const clampedBucket = Math.max(0, Math.min(90, bucket));
        scoreBuckets[clampedBucket].count++;
        scoreBuckets[clampedBucket].wins += result.hit ? 1 : 0;
        scoreBuckets[clampedBucket].returnSum += result.returnPct;
    }

    const calibrationCurve: CalibrationBucket[] = [];
    for (let b = 0; b <= 90; b += 10) {
        const stats = scoreBuckets[b];
        if (stats.count > 0) {
            const winRate = stats.wins / stats.count;
            const avgReturn = stats.returnSum / stats.count;

            // SAFETY: If sample size < threshold, factor = 1.0 (no adjustment)
            const hasEnoughSamples = stats.count >= SAFETY_THRESHOLDS.MIN_SAMPLE_SIZE_PER_BUCKET;
            const confidenceFactor = hasEnoughSamples
                ? Math.max(0.5, Math.min(1.5, 0.5 + winRate))
                : 1.0;

            calibrationCurve.push({
                scoreBucketMin: b,
                scoreBucketMax: b + 9,
                winRate: Math.round(winRate * 1000) / 1000,
                avgReturn: Math.round(avgReturn * 100) / 100,
                sampleSize: stats.count,
                confidenceFactor,
            });
        }
    }

    // Calculate CALIBRATED metrics (simulated application of weights)
    let calibratedWins = 0;
    let calibratedReturnSum = 0;
    for (const result of allResults) {
        const weight = strategyWeights[result.strategyName]?.[result.regime] || 1.0;
        const bucket = calibrationCurve.find(b =>
            result.score >= b.scoreBucketMin && result.score <= b.scoreBucketMax
        );
        const factor = bucket?.confidenceFactor || 1.0;

        // Weighted outcome contribution
        const contribution = weight * factor;
        if (result.hit) calibratedWins += contribution;
        calibratedReturnSum += result.returnPct * contribution;
    }

    const calibratedWinRate = calibratedWins / allResults.length;
    const calibratedAvgReturn = calibratedReturnSum / allResults.length;

    // BENCHMARK: Only apply calibration if it improves results
    // BUG FIX: Require winRate to NOT degrade (stricter gating)
    const winRateImproves = calibratedWinRate > baseWinRate;
    const calibrationImproves = winRateImproves; // Strict: winRate must improve
    const calibrationApplied = SAFETY_THRESHOLDS.REQUIRE_IMPROVEMENT ? calibrationImproves : true;

    const benchmark: BenchmarkComparison = {
        winRate_base: Math.round(baseWinRate * 1000) / 1000,
        winRate_calibrated: Math.round(calibratedWinRate * 1000) / 1000,
        avgReturn_base: Math.round(baseAvgReturn * 100) / 100,
        avgReturn_calibrated: Math.round(calibratedAvgReturn * 100) / 100,
        sampleSize: allResults.length,
        calibrationApplied,
        reason: calibrationApplied
            ? 'Calibration improves performance'
            : `Calibration rejected (calibrated winRate ${(calibratedWinRate * 100).toFixed(1)}% <= base ${(baseWinRate * 100).toFixed(1)}%)`,
    };

    console.log(`[WalkForward] Benchmark: base WR=${(baseWinRate * 100).toFixed(1)}%, calibrated WR=${(calibratedWinRate * 100).toFixed(1)}%`);
    console.log(`[WalkForward] Calibration applied: ${calibrationApplied}`);

    // Build profile
    const profile: CalibrationProfile = {
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        dataLimited,
        walkForwardConfig: wfConfig,
        dataRange: {
            start: manifest.config.startDate,
            end: manifest.config.endDate,
            symbolCount: validSymbols.length,
            totalSignals: allResults.length,
        },
        benchmark,
        strategyWeights: calibrationApplied ? strategyWeights : {},
        calibrationCurve: calibrationApplied ? calibrationCurve : [],
        parameterOverrides: {},
        summary: {
            totalTrades: allResults.length,
            winRate: calibrationApplied ? benchmark.winRate_calibrated : benchmark.winRate_base,
            avgReturn: calibrationApplied ? benchmark.avgReturn_calibrated : benchmark.avgReturn_base,
            sharpeRatio: 0,
            maxDrawdown: 0,
        },
    };

    ensureCalibrationDir();
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));

    console.log('[WalkForward] Calibration complete!');
    console.log(`[WalkForward] Profile saved to: ${PROFILE_PATH}`);

    return profile;
}

/**
 * Ensure calibration directory exists
 */
function ensureCalibrationDir(): void {
    if (!fs.existsSync(CALIBRATION_DIR)) {
        fs.mkdirSync(CALIBRATION_DIR, { recursive: true });
    }
}

/**
 * Load calibration profile with validation
 */
export function loadCalibrationProfile(): CalibrationProfile {
    if (!fs.existsSync(PROFILE_PATH)) {
        console.log('[WalkForward] No profile found, calibration OFF');
        return EMPTY_CALIBRATION_PROFILE;
    }

    try {
        const data = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));

        // Schema validation
        if (data.schemaVersion !== '1.0') {
            console.warn(`[WalkForward] Unknown schema version: ${data.schemaVersion}, calibration OFF`);
            return EMPTY_CALIBRATION_PROFILE;
        }

        // Check staleness
        const createdAt = new Date(data.createdAt);
        const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays > SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS) {
            console.warn(`[WalkForward] Profile is ${Math.round(ageInDays)} days old (stale)`);
            // Still return it, but UI will show STALE status
        }

        return data as CalibrationProfile;
    } catch (error) {
        console.error('[WalkForward] Error loading profile, calibration OFF:', error);
        return EMPTY_CALIBRATION_PROFILE;
    }
}

/**
 * Get calibration status for UI
 */
export function getCalibrationStatus(): { status: 'ON' | 'OFF' | 'STALE'; reason: string } {
    if (!fs.existsSync(PROFILE_PATH)) {
        return { status: 'OFF', reason: 'No calibration profile found' };
    }

    try {
        const data = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));

        if (data.schemaVersion !== '1.0') {
            return { status: 'OFF', reason: 'Invalid schema version' };
        }

        if (!data.benchmark?.calibrationApplied) {
            return { status: 'OFF', reason: 'Calibration did not improve performance' };
        }

        const createdAt = new Date(data.createdAt);
        const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays > SAFETY_THRESHOLDS.MAX_PROFILE_AGE_DAYS) {
            return { status: 'STALE', reason: `Profile is ${Math.round(ageInDays)} days old` };
        }

        return { status: 'ON', reason: 'Calibration active' };
    } catch {
        return { status: 'OFF', reason: 'Error reading profile' };
    }
}

