#!/usr/bin/env npx ts-node
/**
 * Walk-Forward Calibration CLI
 * 
 * Runs walk-forward backtesting and generates calibration profile.
 * 
 * Usage: npm run calibrate
 * 
 * Requires: Dataset built first (npm run build:dataset)
 */

import 'dotenv/config';
import { runWalkForwardCalibration } from '../src/lib/training/walkforward-trainer';
import { loadManifest } from '../src/lib/training/dataset-builder';
import { DEFAULT_WALKFORWARD_CONFIG } from '../src/lib/training/calibration-types';

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Walk-Forward Calibration');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    // Check dataset exists
    const manifest = loadManifest();
    if (!manifest) {
        console.error('ERROR: No dataset found.');
        console.error('Please run: npm run build:dataset first.');
        process.exit(1);
    }

    console.log(`Dataset: ${manifest.symbols.length} symbols`);
    console.log(`Valid: ${manifest.symbols.filter(s => s.isValid).length}`);
    console.log(`Date range: ${manifest.config.startDate} to ${manifest.config.endDate}`);
    console.log();

    console.log('Walk-forward config:');
    console.log(`  Train window: ${DEFAULT_WALKFORWARD_CONFIG.trainWindowMonths} months`);
    console.log(`  Test window: ${DEFAULT_WALKFORWARD_CONFIG.testWindowMonths} months`);
    console.log(`  Step size: ${DEFAULT_WALKFORWARD_CONFIG.stepMonths} months`);
    console.log();

    try {
        const profile = await runWalkForwardCalibration(DEFAULT_WALKFORWARD_CONFIG);

        console.log();
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  Calibration Summary');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`Total signals evaluated: ${profile.summary.totalTrades}`);
        console.log(`Overall win rate: ${(profile.summary.winRate * 100).toFixed(1)}%`);
        console.log(`Average return: ${profile.summary.avgReturn.toFixed(2)}%`);
        console.log();

        console.log('Strategy weights by regime:');
        for (const [strategy, regimes] of Object.entries(profile.strategyWeights)) {
            console.log(`  ${strategy}:`);
            for (const [regime, weight] of Object.entries(regimes)) {
                console.log(`    ${regime}: ${weight}x`);
            }
        }
        console.log();

        console.log('Calibration curve:');
        for (const bucket of profile.calibrationCurve) {
            console.log(`  Score ${bucket.scoreBucketMin}-${bucket.scoreBucketMax}: WR=${(bucket.winRate * 100).toFixed(1)}%, n=${bucket.sampleSize}`);
        }
        console.log();

        console.log('Profile saved to: data/calibration/profile.json');

    } catch (error) {
        console.error('Calibration failed:', error);
        process.exit(1);
    }
}

main();
