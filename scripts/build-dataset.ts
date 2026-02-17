#!/usr/bin/env npx tsx
/**
 * Dataset Builder CLI
 * 
 * Downloads historical data from Massive API and builds local dataset.
 * 
 * Usage: npm run build:dataset
 * 
 * Requires: MASSIVE_API_KEY in .env.local
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { buildDataset } from '../src/lib/training/dataset-builder';
import { loadTrainingConfig } from '../src/lib/training/calibration-types';

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Dataset Builder - Massive Stocks Starter Integration');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    // Check API key
    if (!process.env.MASSIVE_API_KEY) {
        console.error('ERROR: MASSIVE_API_KEY not found in environment.');
        console.error('Please add MASSIVE_API_KEY to your .env.local file.');
        process.exit(1);
    }

    // Load universe from training config (respects phase and symbolCount)
    const { universe } = loadTrainingConfig();

    console.log(`Universe: ${universe.length} symbols`);
    console.log(`Symbols: ${universe.join(', ')}`);
    console.log();

    try {
        const manifest = await buildDataset({
            universe,
            yearsBack: 5,
        });

        console.log();
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  Summary');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`Total symbols: ${manifest.symbols.length}`);
        console.log(`Valid symbols: ${manifest.symbols.filter(s => s.isValid).length}`);
        console.log(`Invalid symbols: ${manifest.symbols.filter(s => !s.isValid).length}`);
        console.log();

        // Show invalid symbols
        const invalid = manifest.symbols.filter(s => !s.isValid);
        if (invalid.length > 0) {
            console.log('Skipped (below quality threshold):');
            for (const s of invalid) {
                console.log(`  - ${s.symbol}: ${s.completenessPercent.toFixed(1)}% complete, ${s.barCount} bars`);
            }
        }

        console.log();
        console.log('Dataset saved to: data/datasets/');
        console.log('Manifest: data/datasets/manifest.json');

    } catch (error) {
        console.error('Dataset build failed:', error);
        process.exit(1);
    }
}

main();
