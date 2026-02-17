/**
 * Polygon Live Premarket Provider
 * 
 * Fetches real-time premarket data from Polygon.io API.
 * Uses MASSIVE_API_KEY (which is the same as Polygon key).
 * 
 * SECURITY: Never logs API keys or headers.
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get the effective base URL for Polygon API
 * Priority: MASSIVE_BASE_URL env var > default polygon
 */
export function getEffectiveBaseUrl(): string {
    return process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';
}

/**
 * Get the effective API key (MASSIVE_API_KEY or POLYGON_API_KEY)
 */
function getApiKey(): string | null {
    return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || null;
}

/**
 * Get the effective provider name
 */
export function getEffectiveProvider(): 'massive' | 'polygon' | 'none' {
    if (process.env.MASSIVE_API_KEY) return 'massive';
    if (process.env.POLYGON_API_KEY) return 'polygon';
    return 'none';
}

// =============================================================================
// Time Window Detection
// =============================================================================

/**
 * Check if current time is during premarket hours (4:00 AM to 9:30 AM America/New_York)
 */
export function isPremarketHours(now: Date = new Date()): boolean {
    // Convert to Eastern Time
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

    const timeInMinutes = hour * 60 + minute;
    const startOfPremarket = 4 * 60; // 4:00 AM
    const endOfPremarket = 9 * 60 + 30; // 9:30 AM

    return timeInMinutes >= startOfPremarket && timeInMinutes < endOfPremarket;
}

/**
 * Check if current time is during regular market hours (9:30 AM to 4:00 PM America/New_York)
 */
export function isMarketHours(now: Date = new Date()): boolean {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

    const timeInMinutes = hour * 60 + minute;
    const startOfMarket = 9 * 60 + 30; // 9:30 AM
    const endOfMarket = 16 * 60; // 4:00 PM

    return timeInMinutes >= startOfMarket && timeInMinutes < endOfMarket;
}

// =============================================================================
// Polygon API Response Types
// =============================================================================

interface PolygonSnapshotResponse {
    status: string;
    request_id?: string;
    ticker?: {
        ticker: string;
        day?: {
            o?: number; // open
            h?: number; // high
            l?: number; // low
            c?: number; // close
            v?: number; // volume
        };
        prevDay?: {
            o?: number;
            h?: number;
            l?: number;
            c?: number; // previous close
            v?: number;
        };
        lastTrade?: {
            p?: number; // price
            s?: number; // size
            t?: number; // timestamp
        };
        lastQuote?: {
            P?: number; // ask price
            p?: number; // bid price
        };
        min?: {
            av?: number; // accumulated volume
            o?: number;  // open
            h?: number;  // high
            l?: number;  // low
            c?: number;  // close
            v?: number;  // volume
            vw?: number; // vwap
        };
        todaysChange?: number;
        todaysChangePerc?: number;
    };
    error?: string;
    message?: string;
}

// =============================================================================
// Provider Error Type
// =============================================================================

export interface ProviderError {
    provider: string;
    status: string;
    code?: string;
    messagePreview?: string; // First 200 chars only
}

// =============================================================================
// Snapshot Result Type
// =============================================================================

export type LivePriceSource = 'PREMARKET_TRADE' | 'DAY_OPEN' | 'PREV_CLOSE';

export interface PolygonSnapshot {
    symbol: string;
    prevClose: number | null;
    open: number | null;
    lastPrice: number | null;
    premarketPrice: number | null;
    livePrice: number | null;
    livePriceSource: LivePriceSource | null;
    lastTradeTimestamp: number | null;
    dataMode: 'PREMARKET' | 'OPEN_FALLBACK';
    error?: ProviderError;
}

// =============================================================================
// API Fetch
// =============================================================================

/**
 * Fetch snapshot for a single symbol from Polygon API
 */
export async function fetchPolygonSnapshot(symbol: string): Promise<PolygonSnapshot> {
    const apiKey = getApiKey();
    const baseUrl = getEffectiveBaseUrl();
    const provider = getEffectiveProvider();

    if (!apiKey) {
        return {
            symbol,
            prevClose: null,
            open: null,
            lastPrice: null,
            premarketPrice: null,
            livePrice: null,
            livePriceSource: null,
            lastTradeTimestamp: null,
            dataMode: 'OPEN_FALLBACK',
            error: {
                provider,
                status: 'NO_API_KEY',
                messagePreview: 'No API key configured (MASSIVE_API_KEY or POLYGON_API_KEY)',
            },
        };
    }

    const url = `${baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type') || '';

        let body: PolygonSnapshotResponse;
        if (contentType.includes('application/json')) {
            body = await response.json() as PolygonSnapshotResponse;
        } else {
            const text = await response.text();
            return {
                symbol,
                prevClose: null,
                open: null,
                lastPrice: null,
                premarketPrice: null,
                livePrice: null,
                livePriceSource: null,
                lastTradeTimestamp: null,
                dataMode: 'OPEN_FALLBACK',
                error: {
                    provider,
                    status: `NON_JSON_RESPONSE`,
                    messagePreview: `Expected JSON, got ${contentType}. Body: ${text.slice(0, 150)}`,
                },
            };
        }

        if (!response.ok || body.status === 'ERROR') {
            return {
                symbol,
                prevClose: null,
                open: null,
                lastPrice: null,
                premarketPrice: null,
                livePrice: null,
                livePriceSource: null,
                lastTradeTimestamp: null,
                dataMode: 'OPEN_FALLBACK',
                error: {
                    provider,
                    status: `HTTP_${response.status}`,
                    code: response.status.toString(),
                    messagePreview: (body.error || body.message || 'Unknown error').slice(0, 200),
                },
            };
        }

        // Parse the ticker data
        const ticker = body.ticker;
        if (!ticker) {
            return {
                symbol,
                prevClose: null,
                open: null,
                lastPrice: null,
                premarketPrice: null,
                livePrice: null,
                livePriceSource: null,
                lastTradeTimestamp: null,
                dataMode: 'OPEN_FALLBACK',
                error: {
                    provider,
                    status: 'NO_TICKER_DATA',
                    messagePreview: 'Response OK but no ticker data returned',
                },
            };
        }

        const prevClose = ticker.prevDay?.c ?? null;
        const open = ticker.day?.o ?? null;
        const lastPrice = ticker.lastTrade?.p ?? null;
        const lastTradeTimestamp = ticker.lastTrade?.t ?? null;

        // Legacy: premarket price (backward compat, NOT used for coverage)
        const now = new Date();
        const inPremarket = isPremarketHours(now);
        const premarketPrice = inPremarket && lastPrice !== null ? lastPrice : null;

        // Cascading livePrice: best available price regardless of session
        let livePrice: number | null = null;
        let livePriceSource: LivePriceSource | null = null;

        if (lastPrice !== null) {
            livePrice = lastPrice;
            livePriceSource = 'PREMARKET_TRADE';
        } else if (open !== null) {
            livePrice = open;
            livePriceSource = 'DAY_OPEN';
        } else if (prevClose !== null) {
            livePrice = prevClose;
            livePriceSource = 'PREV_CLOSE';
        }

        // dataMode driven by livePrice availability
        const dataMode = livePrice !== null ? 'PREMARKET' : 'OPEN_FALLBACK';

        return {
            symbol,
            prevClose,
            open,
            lastPrice,
            premarketPrice,
            livePrice,
            livePriceSource,
            lastTradeTimestamp,
            dataMode,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown fetch error';
        return {
            symbol,
            prevClose: null,
            open: null,
            lastPrice: null,
            premarketPrice: null,
            livePrice: null,
            livePriceSource: null,
            lastTradeTimestamp: null,
            dataMode: 'OPEN_FALLBACK',
            error: {
                provider,
                status: 'FETCH_ERROR',
                messagePreview: message.slice(0, 200),
            },
        };
    }
}

/**
 * Fetch snapshots for multiple symbols (batch with rate limiting)
 */
export async function fetchPolygonSnapshots(
    symbols: string[],
    options: { maxConcurrent?: number; delayMs?: number } = {}
): Promise<{ snapshots: Map<string, PolygonSnapshot>; errors: ProviderError[] }> {
    const { maxConcurrent = 5, delayMs = 50 } = options;
    const snapshots = new Map<string, PolygonSnapshot>();
    const errors: ProviderError[] = [];

    // Process in batches
    for (let i = 0; i < symbols.length; i += maxConcurrent) {
        const batch = symbols.slice(i, i + maxConcurrent);
        const results = await Promise.all(batch.map(fetchPolygonSnapshot));

        for (const result of results) {
            snapshots.set(result.symbol, result);
            if (result.error) {
                errors.push(result.error);
            }
        }

        // Small delay between batches to avoid rate limiting
        if (i + maxConcurrent < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return { snapshots, errors };
}

// =============================================================================
// Detailed Diagnostics Snapshot (raw fields exposed)
// =============================================================================

export interface PolygonSnapshotDetailed {
    symbol: string;
    rawFields: {
        prevDayClose: number | null;
        dayOpen: number | null;
        lastTradePrice: number | null;
        lastTradeTimestamp: number | null;
        minClose: number | null;
        askPrice: number | null;
        bidPrice: number | null;
    };
    computed: {
        premarketPrice: number | null;
        premarketPriceSource: string;
        livePrice: number | null;
        livePriceSource: LivePriceSource | null;
        dataMode: 'PREMARKET' | 'OPEN_FALLBACK';
        isPremarketHours: boolean;
    };
    error?: ProviderError;
}

/**
 * Fetch snapshot with detailed raw field breakdown for diagnostics
 */
export async function fetchPolygonSnapshotDetailed(symbol: string): Promise<PolygonSnapshotDetailed> {
    const apiKey = getApiKey();
    const baseUrl = getEffectiveBaseUrl();
    const provider = getEffectiveProvider();
    const now = new Date();
    const inPremarket = isPremarketHours(now);

    if (!apiKey) {
        return {
            symbol,
            rawFields: {
                prevDayClose: null,
                dayOpen: null,
                lastTradePrice: null,
                lastTradeTimestamp: null,
                minClose: null,
                askPrice: null,
                bidPrice: null,
            },
            computed: {
                premarketPrice: null,
                premarketPriceSource: 'none (NO_API_KEY)',
                livePrice: null,
                livePriceSource: null,
                dataMode: 'OPEN_FALLBACK',
                isPremarketHours: inPremarket,
            },
            error: {
                provider,
                status: 'NO_API_KEY',
                messagePreview: 'No API key configured',
            },
        };
    }

    const url = `${baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            const text = await response.text();
            return {
                symbol,
                rawFields: {
                    prevDayClose: null,
                    dayOpen: null,
                    lastTradePrice: null,
                    lastTradeTimestamp: null,
                    minClose: null,
                    askPrice: null,
                    bidPrice: null,
                },
                computed: {
                    premarketPrice: null,
                    premarketPriceSource: `none (HTTP_${response.status})`,
                    livePrice: null,
                    livePriceSource: null,
                    dataMode: 'OPEN_FALLBACK',
                    isPremarketHours: inPremarket,
                },
                error: {
                    provider,
                    status: `HTTP_${response.status}`,
                    messagePreview: text.slice(0, 200),
                },
            };
        }

        const body = await response.json() as PolygonSnapshotResponse;

        if (!response.ok || body.status === 'ERROR' || !body.ticker) {
            return {
                symbol,
                rawFields: {
                    prevDayClose: null,
                    dayOpen: null,
                    lastTradePrice: null,
                    lastTradeTimestamp: null,
                    minClose: null,
                    askPrice: null,
                    bidPrice: null,
                },
                computed: {
                    premarketPrice: null,
                    premarketPriceSource: `none (${body.ticker ? 'API_ERROR' : 'NO_TICKER'})`,
                    livePrice: null,
                    livePriceSource: null,
                    dataMode: 'OPEN_FALLBACK',
                    isPremarketHours: inPremarket,
                },
                error: {
                    provider,
                    status: `HTTP_${response.status}`,
                    messagePreview: (body.error || body.message || 'No ticker data').slice(0, 200),
                },
            };
        }

        const ticker = body.ticker;
        const prevDayClose = ticker.prevDay?.c ?? null;
        const dayOpen = ticker.day?.o ?? null;
        const lastTradePrice = ticker.lastTrade?.p ?? null;
        const lastTradeTimestamp = ticker.lastTrade?.t ?? null;
        const minClose = ticker.min?.c ?? null;
        const askPrice = ticker.lastQuote?.P ?? null;
        const bidPrice = ticker.lastQuote?.p ?? null;

        // Legacy premarket price (backward compat)
        let premarketPrice: number | null = null;
        let premarketPriceSource = 'none (not in premarket or no price)';

        if (inPremarket && lastTradePrice !== null) {
            premarketPrice = lastTradePrice;
            premarketPriceSource = 'lastTrade.p';
        } else if (!inPremarket) {
            premarketPriceSource = 'none (not in premarket hours)';
        } else if (lastTradePrice === null) {
            premarketPriceSource = 'none (lastTrade.p is null)';
        }

        // Cascading livePrice: best available price regardless of session
        let livePrice: number | null = null;
        let livePriceSource: LivePriceSource | null = null;

        if (lastTradePrice !== null) {
            livePrice = lastTradePrice;
            livePriceSource = 'PREMARKET_TRADE';
        } else if (dayOpen !== null) {
            livePrice = dayOpen;
            livePriceSource = 'DAY_OPEN';
        } else if (prevDayClose !== null) {
            livePrice = prevDayClose;
            livePriceSource = 'PREV_CLOSE';
        }

        const dataMode = livePrice !== null ? 'PREMARKET' : 'OPEN_FALLBACK';

        return {
            symbol,
            rawFields: {
                prevDayClose,
                dayOpen,
                lastTradePrice,
                lastTradeTimestamp,
                minClose,
                askPrice,
                bidPrice,
            },
            computed: {
                premarketPrice,
                premarketPriceSource,
                livePrice,
                livePriceSource,
                dataMode,
                isPremarketHours: inPremarket,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
            symbol,
            rawFields: {
                prevDayClose: null,
                dayOpen: null,
                lastTradePrice: null,
                lastTradeTimestamp: null,
                minClose: null,
                askPrice: null,
                bidPrice: null,
            },
            computed: {
                premarketPrice: null,
                premarketPriceSource: `none (FETCH_ERROR)`,
                livePrice: null,
                livePriceSource: null,
                dataMode: 'OPEN_FALLBACK',
                isPremarketHours: inPremarket,
            },
            error: {
                provider,
                status: 'FETCH_ERROR',
                messagePreview: message.slice(0, 200),
            },
        };
    }
}

// =============================================================================
// Diagnostics
// =============================================================================

export interface LiveProviderDiagnostics {
    effectiveProvider: 'massive' | 'polygon' | 'none';
    effectiveBaseUrl: string;
    hasMassiveKey: boolean;
    hasPolygonKey: boolean;
    isPremarketHours: boolean;
    isMarketHours: boolean;
    currentTimeET: string;
}

export function getLiveProviderDiagnostics(): LiveProviderDiagnostics {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true,
    });

    return {
        effectiveProvider: getEffectiveProvider(),
        effectiveBaseUrl: getEffectiveBaseUrl(),
        hasMassiveKey: !!process.env.MASSIVE_API_KEY,
        hasPolygonKey: !!process.env.POLYGON_API_KEY,
        isPremarketHours: isPremarketHours(now),
        isMarketHours: isMarketHours(now),
        currentTimeET: formatter.format(now),
    };
}
