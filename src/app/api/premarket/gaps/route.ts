/**
 * Premarket Gaps API Route
 * 
 * GET /api/premarket/gaps
 * 
 * Query params:
 * - date: YYYY-MM-DD (optional)
 * - clamp: true|false (default true)
 * - preferLive: true|false (default false)
 * - force: true|false (default false)
 * - minAbsGapPct: number (default 3)
 * - minPrice: number (default 5)
 * - minAvgDailyVolume20: number (default 1000000)
 * - excludeETFs: true|false (default true)
 * - gapBandPct: number (default 1)
 * - minSampleSize: number (default 30)
 * - holdDays: number (default 1)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import {
    runPremarketScan,
    resolvePremarketDate,
    isDateOutOfRangeError,
    DEFAULT_GAP_SCANNER_CONFIG,
    DEFAULT_ANALOG_CONFIG,
    getPremarketUniverse,
    getLivePremarketSnapshot,
} from '@/lib/brains/premarket';
import type { GapScannerConfig, AnalogConfig } from '@/lib/brains/premarket';

const PREMARKET_DIR = 'data/premarket';

// =============================================================================
// Validation Helpers
// =============================================================================

interface ValidationError {
    field: string;
    message: string;
}

function parseNumber(value: string | null, field: string): { value: number | null; error?: ValidationError } {
    if (value === null) return { value: null };
    const num = parseFloat(value);
    if (isNaN(num)) {
        return { value: null, error: { field, message: `Invalid number: "${value}"` } };
    }
    return { value: num };
}

function parseBoolean(value: string | null): boolean | null {
    if (value === null) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}

function validateRange(value: number | null, field: string, min: number, max: number): ValidationError | null {
    if (value === null) return null;
    if (value < min || value > max) {
        return { field, message: `Value ${value} out of range [${min}, ${max}]` };
    }
    return null;
}

// =============================================================================
// Main Handler
// =============================================================================

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const errors: ValidationError[] = [];
        const received: Record<string, string | null> = {};

        // Capture all received params for error response
        const paramNames = [
            'date', 'clamp', 'preferLive', 'force',
            'minAbsGapPct', 'minPrice', 'minAvgDailyVolume20', 'excludeETFs',
            'gapBandPct', 'minSampleSize', 'holdDays'
        ];
        for (const name of paramNames) {
            received[name] = searchParams.get(name);
        }

        // Parse and validate date
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(dateParam)) {
                errors.push({ field: 'date', message: 'Invalid format. Use YYYY-MM-DD' });
            }
        }

        // Parse boolean params
        const clampParam = parseBoolean(searchParams.get('clamp'));
        const preferLiveParam = parseBoolean(searchParams.get('preferLive'));
        const forceParam = parseBoolean(searchParams.get('force'));
        const excludeETFsParam = parseBoolean(searchParams.get('excludeETFs'));

        // Parse numeric params
        const minAbsGapPct = parseNumber(searchParams.get('minAbsGapPct'), 'minAbsGapPct');
        const minPrice = parseNumber(searchParams.get('minPrice'), 'minPrice');
        const minAvgDailyVolume20 = parseNumber(searchParams.get('minAvgDailyVolume20'), 'minAvgDailyVolume20');
        const gapBandPct = parseNumber(searchParams.get('gapBandPct'), 'gapBandPct');
        const minSampleSize = parseNumber(searchParams.get('minSampleSize'), 'minSampleSize');
        const holdDays = parseNumber(searchParams.get('holdDays'), 'holdDays');

        // Collect parse errors
        if (minAbsGapPct.error) errors.push(minAbsGapPct.error);
        if (minPrice.error) errors.push(minPrice.error);
        if (minAvgDailyVolume20.error) errors.push(minAvgDailyVolume20.error);
        if (gapBandPct.error) errors.push(gapBandPct.error);
        if (minSampleSize.error) errors.push(minSampleSize.error);
        if (holdDays.error) errors.push(holdDays.error);

        // Validate ranges
        const rangeErrors = [
            validateRange(minAbsGapPct.value, 'minAbsGapPct', 0.1, 50),
            validateRange(minPrice.value, 'minPrice', 0, 10000),
            validateRange(minAvgDailyVolume20.value, 'minAvgDailyVolume20', 0, 100000000),
            validateRange(gapBandPct.value, 'gapBandPct', 0.1, 10),
            validateRange(minSampleSize.value, 'minSampleSize', 1, 1000),
            validateRange(holdDays.value, 'holdDays', 1, 30),
        ].filter(Boolean) as ValidationError[];
        errors.push(...rangeErrors);

        // If validation errors, return 400
        if (errors.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'BAD_REQUEST',
                    errors,
                    received,
                },
                { status: 400 }
            );
        }

        // Build effective config
        const scannerConfig: GapScannerConfig = {
            minAbsGapPct: minAbsGapPct.value ?? DEFAULT_GAP_SCANNER_CONFIG.minAbsGapPct,
            minPrice: minPrice.value ?? 5, // User requested default 5
            minAvgDailyVolume20: minAvgDailyVolume20.value ?? DEFAULT_GAP_SCANNER_CONFIG.minAvgDailyVolume20,
            excludeETFs: excludeETFsParam ?? true, // User requested default true
        };

        const analogConfig: AnalogConfig = {
            gapBandPct: gapBandPct.value ?? DEFAULT_ANALOG_CONFIG.gapBandPct,
            minSampleSize: minSampleSize.value ?? DEFAULT_ANALOG_CONFIG.minSampleSize,
            holdDays: holdDays.value ?? DEFAULT_ANALOG_CONFIG.holdDays,
            rDefinition: DEFAULT_ANALOG_CONFIG.rDefinition,
        };

        // Pre-check live coverage before resolving date
        let liveCoverageCount = 0;
        let universeCount = 48; // default
        const today = new Date().toISOString().slice(0, 10);

        if (preferLiveParam) {
            const universe = getPremarketUniverse();
            universeCount = universe.length;
            const snapMap = await getLivePremarketSnapshot(universe, today);
            liveCoverageCount = Array.from(snapMap.values()).filter(s => s.livePrice !== null && s.livePrice !== undefined).length;
        }

        // Resolve the date with real coverage data
        const resolution = resolvePremarketDate({
            requestedDate: dateParam ?? undefined,
            clamp: clampParam ?? true, // Default true
            preferLive: preferLiveParam ?? false, // Default false
            liveCoverageCount,
            universeCount,
        });

        // If date is out of range and clamp=false, return 400
        if (isDateOutOfRangeError(resolution)) {
            return NextResponse.json(
                {
                    success: false,
                    errorCode: 'DATE_OUT_OF_RANGE',
                    datasetRange: resolution.datasetRange,
                    requestedDate: resolution.requestedDate,
                    suggestion: resolution.suggestion,
                    message: `Requested date ${resolution.requestedDate} is outside dataset range (${resolution.datasetRange.firstDate} to ${resolution.datasetRange.lastDate}). Use clamp=true to auto-select the nearest valid date.`,
                },
                { status: 400 }
            );
        }

        // Use the effective date from resolution
        const scanDate = new Date(resolution.effectiveDate + 'T12:00:00Z');

        // Build configUsed object
        const configUsed = {
            scannerConfig,
            analogConfig,
            clamp: clampParam ?? true,
            preferLive: preferLiveParam ?? false,
        };

        // Run scan with resolved info
        const result = runPremarketScan(scanDate, {
            force: forceParam ?? false,
            scannerConfig,
            analogConfig,
            resolved: {
                requestedDate: resolution.requestedDate,
                effectiveDate: resolution.effectiveDate,
                mode: resolution.mode,
                reason: resolution.reason,
                datasetRange: resolution.datasetRange,
            },
        });

        // Build full response with configUsed
        const response = {
            success: true,
            ...result,
            configUsed,
        };

        // Save to file for history (always on success)
        try {
            if (!fs.existsSync(PREMARKET_DIR)) {
                fs.mkdirSync(PREMARKET_DIR, { recursive: true });
            }
            const filename = path.join(PREMARKET_DIR, `${resolution.effectiveDate}.json`);
            fs.writeFileSync(filename, JSON.stringify(response, null, 2));
        } catch (saveErr) {
            console.warn('[Premarket API] Failed to save scan result:', saveErr);
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Premarket API] Error:', error);
        return NextResponse.json(
            {
                success: false,
                errorCode: 'INTERNAL_ERROR',
                error: 'Failed to run premarket scan',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
