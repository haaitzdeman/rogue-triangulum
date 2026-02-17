/**
 * Options Chain Provider
 *
 * Fetches options chain data from Polygon (Massive) API.
 * Env-driven: MASSIVE_API_KEY, MASSIVE_BASE_URL (fallback: https://api.polygon.io)
 *
 * SECURITY: Never logs API keys or sensitive headers.
 *
 * Uses:
 * - GET /v3/reference/options/contracts — contract reference data
 * - GET /v3/snapshot/options/{underlying} — live options snapshot
 * - GET /v2/snapshot/locale/us/markets/stocks/tickers/{symbol} — underlying price
 */

import type { OptionContract, LiquidityConfig } from './options-types';

// =============================================================================
// Configuration
// =============================================================================

function getApiKey(): string | null {
    return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || null;
}

function getBaseUrl(): string {
    return process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';
}

// =============================================================================
// Provider Error Types
// =============================================================================

export interface ProviderError {
    status: string;
    message: string;
}

export interface UnderlyingSnapshot {
    price: number;
    prevClose: number;
    change: number;
    changePct: number;
}

export interface OptionsChainResult {
    contracts: OptionContract[];
    underlyingSnapshot: UnderlyingSnapshot | null;
    error?: ProviderError;
}

// =============================================================================
// Underlying Price Fetch
// =============================================================================

/**
 * Fetch the underlying stock price from Polygon snapshot API.
 * GET /v2/snapshot/locale/us/markets/stocks/tickers/{symbol}
 */
export async function fetchUnderlyingPrice(symbol: string): Promise<{
    snapshot: UnderlyingSnapshot | null;
    error?: ProviderError;
}> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            snapshot: null,
            error: { status: 'NO_API_KEY', message: 'No API key configured (MASSIVE_API_KEY or POLYGON_API_KEY)' },
        };
    }

    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol.toUpperCase()}?apiKey=${apiKey}`;

    try {
        const res = await fetch(url);

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return {
                snapshot: null,
                error: {
                    status: `HTTP_${res.status}`,
                    message: (body as Record<string, unknown>)?.error?.toString()?.substring(0, 200) || `HTTP ${res.status}`,
                },
            };
        }

        const data = await res.json() as {
            ticker?: {
                prevDay?: { c?: number };
                day?: { c?: number };
                lastTrade?: { p?: number };
                todaysChange?: number;
                todaysChangePerc?: number;
            };
        };

        const ticker = data.ticker;
        if (!ticker) {
            return {
                snapshot: null,
                error: { status: 'NO_DATA', message: 'No ticker data in response' },
            };
        }

        const price = ticker.lastTrade?.p || ticker.day?.c || 0;
        const prevClose = ticker.prevDay?.c || 0;

        return {
            snapshot: {
                price,
                prevClose,
                change: ticker.todaysChange || (price - prevClose),
                changePct: ticker.todaysChangePerc || (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0),
            },
        };
    } catch (err) {
        return {
            snapshot: null,
            error: {
                status: 'FETCH_ERROR',
                message: err instanceof Error ? err.message.substring(0, 200) : 'Unknown fetch error',
            },
        };
    }
}

// =============================================================================
// Options Snapshot Fetch
// =============================================================================

/**
 * Fetch options snapshot data from Polygon.
 * GET /v3/snapshot/options/{underlying}
 *
 * Returns raw option contract data mapped to OptionContract[].
 */
export async function fetchOptionsSnapshot(underlying: string): Promise<{
    contracts: OptionContract[];
    error?: ProviderError;
}> {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            contracts: [],
            error: { status: 'NO_API_KEY', message: 'No API key configured' },
        };
    }

    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/v3/snapshot/options/${underlying.toUpperCase()}?limit=250&apiKey=${apiKey}`;

    try {
        const res = await fetch(url);

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return {
                contracts: [],
                error: {
                    status: `HTTP_${res.status}`,
                    message: (body as Record<string, unknown>)?.error?.toString()?.substring(0, 200) || `HTTP ${res.status}`,
                },
            };
        }

        const data = await res.json() as {
            results?: Array<{
                details?: {
                    contract_type?: string;
                    strike_price?: number;
                    expiration_date?: string;
                    ticker?: string;
                };
                day?: {
                    volume?: number;
                    open_interest?: number;
                };
                last_quote?: {
                    bid?: number;
                    ask?: number;
                };
                implied_volatility?: number;
                open_interest?: number;
            }>;
        };

        const results = data.results || [];
        const now = new Date();

        const contracts: OptionContract[] = results
            .filter(r => r.details?.strike_price && r.details?.expiration_date)
            .map(r => {
                const bid = r.last_quote?.bid || 0;
                const ask = r.last_quote?.ask || 0;
                const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
                const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 100;

                const expDate = new Date(r.details!.expiration_date!);
                const daysToExp = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

                return {
                    symbol: r.details?.ticker || '',
                    strike: r.details!.strike_price!,
                    expiration: r.details!.expiration_date!,
                    type: (r.details?.contract_type?.toUpperCase() === 'PUT' ? 'PUT' : 'CALL') as 'CALL' | 'PUT',
                    bid,
                    ask,
                    mid: Math.round(mid * 100) / 100,
                    volume: r.day?.volume || 0,
                    openInterest: r.open_interest || r.day?.open_interest || 0,
                    impliedVolatility: r.implied_volatility || 0,
                    daysToExpiration: daysToExp,
                    bidAskSpreadPct: Math.round(spreadPct * 100) / 100,
                };
            });

        return { contracts };
    } catch (err) {
        return {
            contracts: [],
            error: {
                status: 'FETCH_ERROR',
                message: err instanceof Error ? err.message.substring(0, 200) : 'Unknown fetch error',
            },
        };
    }
}

// =============================================================================
// Liquidity Filtering
// =============================================================================

/**
 * Filter contracts by liquidity criteria.
 * Rejects contracts that fail minOpenInterest, minVolume, or maxBidAskSpreadPct.
 */
export function filterByLiquidity(
    contracts: OptionContract[],
    config: LiquidityConfig,
): OptionContract[] {
    return contracts.filter(c =>
        c.openInterest >= config.minOpenInterest &&
        c.volume >= config.minVolume &&
        c.bidAskSpreadPct <= config.maxBidAskSpreadPct
    );
}

/**
 * Compute a liquidity score (0–100) for a set of contracts.
 * Based on average OI and volume relative to thresholds.
 */
export function computeLiquidityScore(contracts: OptionContract[]): number {
    if (contracts.length === 0) return 0;

    const avgOI = contracts.reduce((sum, c) => sum + c.openInterest, 0) / contracts.length;
    const avgVol = contracts.reduce((sum, c) => sum + c.volume, 0) / contracts.length;

    // Score components (each 0–50, total 0–100)
    const oiScore = Math.min(50, (avgOI / 1000) * 50);
    const volScore = Math.min(50, (avgVol / 500) * 50);

    return Math.round(oiScore + volScore);
}
