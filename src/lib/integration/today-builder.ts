/**
 * Today Opportunity Builder — Shared Logic
 *
 * Extracts the core opportunity-building pipeline so both
 * GET /api/today/opportunities and POST /api/morning-run
 * can call the same deterministic logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildRankedOpportunity } from '@/lib/brains/coordinator';
import type { PremarketScanResult, GapCandidate } from '@/lib/brains/premarket';
import type { OptionScanCandidate } from '@/lib/brains/options';

// =============================================================================
// Cache Loaders
// =============================================================================

export function loadPremarketScan(date: string): PremarketScanResult | null {
    const filePath = path.join('data', 'premarket', `${date}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as PremarketScanResult;
    } catch {
        return null;
    }
}

export function loadOptionsScans(date: string): OptionScanCandidate[] {
    const dir = path.join('data', 'options', date);
    if (!fs.existsSync(dir)) return [];

    const results: OptionScanCandidate[] = [];
    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(dir, file), 'utf-8');
                results.push(JSON.parse(content) as OptionScanCandidate);
            } catch {
                // Skip malformed files
            }
        }
    } catch {
        // Dir read error
    }

    return results;
}

// =============================================================================
// Builder
// =============================================================================

export interface TodayResult {
    opportunities: ReturnType<typeof buildRankedOpportunity>[];
    sources: {
        premarketCandidates: number;
        optionsScans: number;
    };
    freshness: {
        premarketScanTimestamp: string | null;
        optionsScanTimestamps: Record<string, string>;
        missingOptions: string[];
    };
}

export function buildTodayOpportunities(date: string): TodayResult {
    const premarketResult = loadPremarketScan(date);
    const optionsScans = loadOptionsScans(date);

    // Index premarket by symbol
    const premarketBySymbol = new Map<string, GapCandidate>();
    if (premarketResult) {
        for (const candidate of premarketResult.candidates) {
            premarketBySymbol.set(candidate.symbol.toUpperCase(), candidate);
        }
    }

    // Index options by symbol
    const optionsBySymbol = new Map<string, OptionScanCandidate>();
    const optionsScanTimestamps: Record<string, string> = {};
    for (const scan of optionsScans) {
        const sym = scan.underlyingSymbol.toUpperCase();
        optionsBySymbol.set(sym, scan);
        const scannedAt = (scan as unknown as Record<string, unknown>).scannedAt;
        if (typeof scannedAt === 'string') {
            optionsScanTimestamps[sym] = scannedAt;
        } else {
            const optFile = path.join('data', 'options', date, `${sym}.json`);
            try {
                const stat = fs.statSync(optFile);
                optionsScanTimestamps[sym] = stat.mtime.toISOString();
            } catch {
                // skip
            }
        }
    }

    // Union
    const allSymbols = new Set<string>();
    premarketBySymbol.forEach((_v, k) => allSymbols.add(k));
    optionsBySymbol.forEach((_v, k) => allSymbols.add(k));

    // Missing options
    const missingOptions: string[] = [];
    premarketBySymbol.forEach((_v, sym) => {
        if (!optionsBySymbol.has(sym)) missingOptions.push(sym);
    });

    // Build + sort
    const opportunities: ReturnType<typeof buildRankedOpportunity>[] = [];
    allSymbols.forEach(symbol => {
        const pm = premarketBySymbol.get(symbol) || null;
        const opt = optionsBySymbol.get(symbol) || null;
        opportunities.push(buildRankedOpportunity(symbol, pm, opt));
    });
    opportunities.sort((a, b) => b.overallScore - a.overallScore);

    const premarketScanTimestamp = (premarketResult as Record<string, unknown> | null)?.generatedAt as string | null ?? null;

    return {
        opportunities,
        sources: {
            premarketCandidates: premarketResult?.candidates.length ?? 0,
            optionsScans: optionsScans.length,
        },
        freshness: {
            premarketScanTimestamp,
            optionsScanTimestamps,
            missingOptions,
        },
    };
}
