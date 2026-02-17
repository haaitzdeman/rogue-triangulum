/**
 * Alpaca REST Client
 *
 * READ-ONLY client for Alpaca paper trading API.
 * - Lazy initialization (env read on first use, not at module load)
 * - 30 second timeout on all requests
 * - Safe error truncation (first 200 chars, never echoes keys)
 *
 * HARD RULE: This module NEVER places orders or submits trades.
 */

import type { AlpacaActivity, AlpacaOrder, AlpacaAccountSafe } from './types';

// =============================================================================
// Client Factory
// =============================================================================

interface AlpacaClientConfig {
    apiKey: string;
    apiSecret: string;
    baseUrl: string;
}

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';

let cachedConfig: AlpacaClientConfig | null = null;

/**
 * Lazily reads env vars and returns the config.
 * Throws if required keys are missing or if base URL is not paper.
 *
 * SAFETY: We ONLY allow paper-api.alpaca.markets.
 * If ALPACA_BASE_URL points to live trading, we refuse to proceed.
 */
function getConfig(): AlpacaClientConfig {
    if (cachedConfig) return cachedConfig;

    const apiKey = process.env.ALPACA_API_KEY;
    const apiSecret = process.env.ALPACA_API_SECRET;
    const baseUrl = process.env.ALPACA_BASE_URL || PAPER_BASE_URL;

    if (!apiKey || !apiSecret) {
        throw new Error('ALPACA_API_KEY and ALPACA_API_SECRET must be set');
    }

    // Paper-only guard: refuse live trading endpoints
    if (!baseUrl.includes('paper-api.alpaca.markets')) {
        throw new Error(
            'LIVE_DISABLED: Only paper-api.alpaca.markets is allowed. ' +
            `Current ALPACA_BASE_URL: ${baseUrl.replace(/\/\/.*@/, '//***@')}`
        );
    }

    cachedConfig = { apiKey, apiSecret, baseUrl };
    return cachedConfig;
}

/** Reset cached config (for testing only) */
export function _resetConfigCache(): void {
    cachedConfig = null;
}

// =============================================================================
// Request Wrapper
// =============================================================================

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_STATUS_CODES = [429, 503];

/**
 * Make an authenticated GET request to Alpaca.
 * - 30s AbortController timeout
 * - Retries up to 2 times on 429/503 with exponential backoff
 * - Truncates error body to 200 chars
 * - Never logs or returns API keys
 */
async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const cfg = getConfig();
    const url = new URL(path, cfg.baseUrl);

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== '') {
                url.searchParams.set(k, v);
            }
        }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            // Exponential backoff: 1s, 2s
            const delayMs = 1000 * attempt;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const res = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'APCA-API-KEY-ID': cfg.apiKey,
                    'APCA-API-SECRET-KEY': cfg.apiSecret,
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            });

            if (RETRY_STATUS_CODES.includes(res.status) && attempt < MAX_RETRIES) {
                lastError = new Error(`Alpaca ${res.status}: rate limited, retrying...`);
                continue;
            }

            if (!res.ok) {
                const bodyText = await res.text().catch(() => '');
                const preview = bodyText.slice(0, 200);
                throw new Error(
                    `Alpaca ${res.status}: ${preview}`
                );
            }

            return (await res.json()) as T;
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                throw new Error(`Alpaca request timed out after ${TIMEOUT_MS}ms: ${path}`);
            }
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt >= MAX_RETRIES) throw lastError;
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError ?? new Error('Alpaca request failed after retries');
}

// =============================================================================
// Public API — READ ONLY
// =============================================================================

/**
 * List trade activities (fills) from Alpaca.
 * Uses GET /v2/account/activities/FILL — the best endpoint for individual fills.
 */
export async function getTradeActivities(
    since?: string,
    until?: string,
): Promise<AlpacaActivity[]> {
    const params: Record<string, string> = {
        direction: 'asc',
    };
    if (since) params.after = new Date(since).toISOString();
    if (until) params.until = new Date(until).toISOString();

    return request<AlpacaActivity[]>('/v2/account/activities/FILL', params);
}

/**
 * List orders from Alpaca.
 * Uses GET /v2/orders with status, date filters, and limit.
 */
export async function listOrders(
    since?: string,
    until?: string,
    status: string = 'all',
    limit: number = 500,
): Promise<AlpacaOrder[]> {
    const params: Record<string, string> = {
        status,
        limit: String(limit),
        direction: 'asc',
    };
    if (since) params.after = new Date(since).toISOString();
    if (until) params.until = new Date(until).toISOString();

    return request<AlpacaOrder[]>('/v2/orders', params);
}

/**
 * Get account info for verification only.
 * Returns ONLY safe fields: id, status, currency.
 * Never returns buying_power, cash, or any sensitive data.
 */
export async function getAccount(): Promise<AlpacaAccountSafe> {
    const raw = await request<Record<string, unknown>>('/v2/account');
    return {
        id: String(raw.id ?? ''),
        status: String(raw.status ?? ''),
        currency: String(raw.currency ?? ''),
    };
}

/**
 * Check if Alpaca credentials are configured (without revealing values).
 */
export function isAlpacaConfigured(): {
    hasApiKey: boolean;
    hasApiSecret: boolean;
    effectiveBaseUrl: string;
} {
    return {
        hasApiKey: !!process.env.ALPACA_API_KEY,
        hasApiSecret: !!process.env.ALPACA_API_SECRET,
        effectiveBaseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    };
}
