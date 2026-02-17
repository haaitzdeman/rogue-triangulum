/**
 * Options Service
 *
 * Orchestrator that combines:
 * 1. Polygon chain provider (fetch contracts + underlying)
 * 2. Liquidity filtering
 * 3. IV rank computation
 * 4. Expected move calculation
 * 5. Decision layer for strategy selection
 * 6. Filesystem caching (data/options/YYYY-MM-DD/{SYMBOL}.json)
 *
 * Single entry point for the API route and UI.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { OptionScanCandidate, LiquidityConfig } from './options-types';
import { DEFAULT_LIQUIDITY_CONFIG } from './options-types';
import { fetchUnderlyingPrice, fetchOptionsSnapshot, filterByLiquidity, computeLiquidityScore } from './options-chain-provider';
import { computeIVRank } from './iv-utils';
import { computeExpectedMove } from './expected-move';
import { selectStrategy } from './options-decision-layer';
import { selectContract } from './contract-selector';

// =============================================================================
// Constants
// =============================================================================

const OPTIONS_DATA_DIR = 'data/options';

// =============================================================================
// Cache Helpers
// =============================================================================

function getDateStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getCacheFilePath(symbol: string, date: string): string {
    return path.join(OPTIONS_DATA_DIR, date, `${symbol.toUpperCase()}.json`);
}

/**
 * Save a scan result to filesystem cache.
 * Path: data/options/YYYY-MM-DD/{SYMBOL}.json
 */
export function saveScanToCache(result: OptionScanCandidate): void {
    const date = result.scannedAt.slice(0, 10);
    const dir = path.join(OPTIONS_DATA_DIR, date);
    ensureDir(dir);

    const filePath = getCacheFilePath(result.underlyingSymbol, date);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log(`[OptionsService] Cached scan: ${filePath}`);
}

/**
 * Load a cached scan from filesystem.
 * Returns null if not found.
 */
export function loadCachedScan(symbol: string, date?: string): OptionScanCandidate | null {
    const d = date || getDateStr();
    const filePath = getCacheFilePath(symbol.toUpperCase(), d);

    if (!fs.existsSync(filePath)) return null;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as OptionScanCandidate;
    } catch {
        return null;
    }
}

/**
 * List all cached scan dates + symbols with summary fields.
 */
export function listCachedScans(): Array<{
    date: string;
    symbol: string;
    strategySuggestion: string;
    ivRankValue: number | null;
    ivRankClassification: string | null;
    expectedMove: number;
    liquidityScore: number;
    scannedAt: string;
}> {
    if (!fs.existsSync(OPTIONS_DATA_DIR)) return [];

    const results: Array<{
        date: string;
        symbol: string;
        strategySuggestion: string;
        ivRankValue: number | null;
        ivRankClassification: string | null;
        expectedMove: number;
        liquidityScore: number;
        scannedAt: string;
    }> = [];

    try {
        const dateDirs = fs.readdirSync(OPTIONS_DATA_DIR)
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort()
            .reverse();

        for (const dateDir of dateDirs) {
            const dirPath = path.join(OPTIONS_DATA_DIR, dateDir);
            const stat = fs.statSync(dirPath);
            if (!stat.isDirectory()) continue;

            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));

            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
                    const data = JSON.parse(content) as OptionScanCandidate;
                    results.push({
                        date: dateDir,
                        symbol: file.replace('.json', ''),
                        strategySuggestion: data.strategySuggestion,
                        ivRankValue: data.ivRank?.rank ?? null,
                        ivRankClassification: data.ivRank?.classification ?? null,
                        expectedMove: data.expectedMove?.expectedMove ?? 0,
                        liquidityScore: data.liquidityScore ?? 0,
                        scannedAt: data.scannedAt ?? '',
                    });
                } catch {
                    // Skip malformed files
                }
            }
        }
    } catch {
        // Directory read error
    }

    return results;
}

// =============================================================================
// Service Result
// =============================================================================

export interface ScanResult {
    success: boolean;
    data?: OptionScanCandidate;
    error?: string;
    errorCode?: string;
    fromCache?: boolean;
}

// =============================================================================
// Main Scan Function
// =============================================================================

/**
 * Scan options for a given symbol.
 *
 * 1. Check cache (unless force=true)
 * 2. Fetch underlying price
 * 3. Fetch options chain snapshot
 * 4. Filter by liquidity
 * 5. Compute IV rank from available contracts
 * 6. Compute expected move
 * 7. Run decision layer
 * 8. Save to cache
 *
 * @param symbol - Ticker symbol (e.g. "AAPL")
 * @param liquidityConfig - Optional custom liquidity thresholds
 * @param force - If true, bypass cache and rescan live
 */
export async function scanOptions(
    symbol: string,
    liquidityConfig?: Partial<LiquidityConfig>,
    force: boolean = false,
): Promise<ScanResult> {
    const config: LiquidityConfig = {
        ...DEFAULT_LIQUIDITY_CONFIG,
        ...liquidityConfig,
    };

    const upperSymbol = symbol.toUpperCase().trim();

    // Check cache unless forced
    if (!force) {
        const cached = loadCachedScan(upperSymbol);
        if (cached) {
            console.log(`[OptionsService] Returning cached scan for ${upperSymbol}`);
            return { success: true, data: cached, fromCache: true };
        }
    }

    // Step 1: Fetch underlying price
    const { snapshot, error: priceError } = await fetchUnderlyingPrice(upperSymbol);
    if (priceError || !snapshot) {
        return {
            success: false,
            error: priceError?.message || 'Failed to fetch underlying price',
            errorCode: priceError?.status || 'PRICE_FETCH_ERROR',
        };
    }

    // Step 2: Fetch options chain
    const { contracts: rawContracts, error: chainError } = await fetchOptionsSnapshot(upperSymbol);
    if (chainError) {
        return {
            success: false,
            error: chainError.message,
            errorCode: chainError.status,
        };
    }

    const totalScanned = rawContracts.length;

    // Step 3: Liquidity filtering
    const filtered = filterByLiquidity(rawContracts, config);

    // Step 4: IV rank
    const ivValues = filtered
        .map(c => c.impliedVolatility)
        .filter(iv => iv > 0);

    let currentIV = 0;
    let yearLowIV: number | null = null;
    let yearHighIV: number | null = null;

    if (ivValues.length > 0) {
        currentIV = ivValues.reduce((a, b) => a + b, 0) / ivValues.length;
        const allIVs = rawContracts
            .map(c => c.impliedVolatility)
            .filter(iv => iv > 0);
        if (allIVs.length >= 5) {
            yearLowIV = Math.min(...allIVs);
            yearHighIV = Math.max(...allIVs);
        }
    }

    const ivRank = computeIVRank(currentIV, yearLowIV, yearHighIV);

    // Step 5: Expected move (nearest expiration)
    const nearestDTE = filtered.length > 0
        ? Math.min(...filtered.map(c => c.daysToExpiration).filter(d => d > 0))
        : 30;

    const expectedMove = computeExpectedMove(snapshot.price, currentIV, nearestDTE || 30);

    // Step 6: Decision layer (uses real Polygon todaysChangePerc)
    const decision = selectStrategy(ivRank, filtered, snapshot.price, snapshot.changePct);

    // Step 7: Compute liquidity score
    const liquidityScore = computeLiquidityScore(filtered);

    // Step 7b: Contract selection — pick specific contract/legs
    const recommendedTrade = selectContract(
        decision.suggestion,
        filtered,
        snapshot.price,
        snapshot.changePct,
    );

    const scanData: OptionScanCandidate = {
        underlyingSymbol: upperSymbol,
        underlyingPrice: snapshot.price,
        ivRank,
        expectedMove,
        liquidityScore,
        strategySuggestion: decision.suggestion,
        rationale: decision.rationale,
        contracts: filtered,
        totalContractsScanned: totalScanned,
        scannedAt: new Date().toISOString(),
        ...(recommendedTrade ? { recommendedTrade } : {}),
    };

    // Step 8: Save to cache
    try {
        saveScanToCache(scanData);
    } catch (err) {
        console.warn('[OptionsService] Cache save failed:', err instanceof Error ? err.message : 'unknown');
        // Non-fatal: continue even if cache fails
    }

    return {
        success: true,
        data: scanData,
        fromCache: false,
    };
}
