/**
 * Calibration API Route
 * 
 * Manual trigger for walk-forward calibration.
 * POST /api/calibration/run
 * 
 * Server-side only.
 */

import { NextResponse } from 'next/server';
import { runWalkForwardCalibration, loadCalibrationProfile } from '@/lib/training/walkforward-trainer';
import { loadManifest } from '@/lib/training/dataset-builder';

/**
 * GET /api/calibration/run - Get current profile status
 */
export async function GET() {
    try {
        const profile = loadCalibrationProfile();
        const manifest = loadManifest();

        return NextResponse.json({
            success: true,
            profile: {
                schemaVersion: profile.schemaVersion,
                createdAt: profile.createdAt,
                lastUpdated: profile.lastUpdated,
                summary: profile.summary,
                dataRange: profile.dataRange,
            },
            dataset: manifest ? {
                symbolCount: manifest.symbols.length,
                validCount: manifest.symbols.filter(s => s.isValid).length,
                dateRange: manifest.config,
            } : null,
        });
    } catch (error) {
        console.error('[API/calibration] GET error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to load calibration status',
        }, { status: 500 });
    }
}

/**
 * POST /api/calibration/run - Run calibration
 */
export async function POST(request: Request) {
    try {
        // Check if dataset exists
        const manifest = loadManifest();
        if (!manifest) {
            return NextResponse.json({
                success: false,
                error: 'No dataset found. Run build:dataset first.',
            }, { status: 400 });
        }

        // Parse optional config overrides
        let config = {};
        try {
            const body = await request.json();
            if (body.config) {
                config = body.config;
            }
        } catch {
            // No body or invalid JSON - use defaults
        }

        console.log('[API/calibration] Starting calibration run...');
        const profile = await runWalkForwardCalibration(config);

        return NextResponse.json({
            success: true,
            profile: {
                schemaVersion: profile.schemaVersion,
                createdAt: profile.createdAt,
                summary: profile.summary,
                strategyCount: Object.keys(profile.strategyWeights).length,
                calibrationBuckets: profile.calibrationCurve.length,
            },
        });
    } catch (error) {
        console.error('[API/calibration] POST error:', error);
        return NextResponse.json({
            success: false,
            error: 'Calibration failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
