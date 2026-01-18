/**
 * Data Caching Layer
 * 
 * Provides caching for market data to reduce API calls.
 * Uses Supabase for persistent cache, in-memory for fast access.
 */

import { supabase, isSupabaseConfigured } from '../supabase/client';
import type { DataResponse } from '../data/types';
import type { Json } from '../supabase/database.types';

// In-memory cache for fast access
type CacheEntry<T> = {
    data: T;
    expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

// Default TTL values (in seconds)
export const CacheTTL = {
    QUOTE: 30,           // 30 seconds for quotes
    CANDLES_INTRADAY: 60, // 1 minute for intraday candles
    CANDLES_DAILY: 300,   // 5 minutes for daily candles
    SYMBOL_INFO: 3600,    // 1 hour for symbol metadata
    FUNDAMENTALS: 3600,   // 1 hour for fundamentals
    INDICATOR: 60,        // 1 minute for indicators
} as const;

/**
 * Generate cache key from parameters
 */
export function generateCacheKey(
    type: string,
    symbol: string,
    ...params: (string | number)[]
): string {
    return [type, symbol, ...params].join(':');
}

/**
 * Get from memory cache
 */
function getFromMemory<T>(key: string): T | null {
    const entry = memoryCache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        memoryCache.delete(key);
        return null;
    }

    return entry.data;
}

/**
 * Set in memory cache
 */
function setInMemory<T>(key: string, data: T, ttlSeconds: number): void {
    memoryCache.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
}

// Type for cache entry from database
interface DbCacheEntry {
    data: Json;
    expires_at: string;
}

/**
 * Get from Supabase cache (persistent)
 */
async function getFromSupabase<T>(key: string): Promise<T | null> {
    if (!isSupabaseConfigured()) return null;

    try {
        // Use raw query to avoid type issues with generated types
        const { data, error } = await supabase
            .from('market_data_cache')
            .select('data, expires_at')
            .eq('cache_key', key)
            .single();

        if (error || !data) return null;

        // Cast to expected type
        const cacheEntry = data as unknown as DbCacheEntry;

        // Check if expired
        if (new Date(cacheEntry.expires_at) < new Date()) {
            // Delete expired entry
            await supabase
                .from('market_data_cache')
                .delete()
                .eq('cache_key', key);
            return null;
        }

        return cacheEntry.data as T;
    } catch {
        return null;
    }
}

/**
 * Set in Supabase cache (persistent)
 */
async function setInSupabase(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

        // Use insert with upsert behavior via RPC or direct insert
        // First try to delete existing, then insert new
        await supabase
            .from('market_data_cache')
            .delete()
            .eq('cache_key', key);

        // Insert using any to bypass strict type checking for dynamically typed cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('market_data_cache') as any).insert({
            cache_key: key,
            data: data as Json,
            expires_at: expiresAt,
        });
    } catch (error) {
        console.warn('Failed to set cache:', error);
    }
}

/**
 * Main cache interface
 */
export const cache = {
    /**
     * Get cached data, checking memory first, then Supabase
     */
    async get<T>(key: string): Promise<T | null> {
        // Try memory first (fastest)
        const memResult = getFromMemory<T>(key);
        if (memResult !== null) {
            return memResult;
        }

        // Try Supabase (persistent)
        const dbResult = await getFromSupabase<T>(key);
        if (dbResult !== null) {
            // Populate memory cache for future requests
            setInMemory(key, dbResult, 60); // Keep in memory for 1 min
            return dbResult;
        }

        return null;
    },

    /**
     * Set cached data in both memory and Supabase
     */
    async set<T>(key: string, data: T, ttlSeconds: number, persistToDb = true): Promise<void> {
        // Always set in memory
        setInMemory(key, data, ttlSeconds);

        // Optionally persist to Supabase
        if (persistToDb) {
            await setInSupabase(key, data, ttlSeconds);
        }
    },

    /**
     * Delete cached data
     */
    async delete(key: string): Promise<void> {
        memoryCache.delete(key);

        if (isSupabaseConfigured()) {
            await supabase
                .from('market_data_cache')
                .delete()
                .eq('cache_key', key);
        }
    },

    /**
     * Clear all cached data (memory only, preserves Supabase)
     */
    clearMemory(): void {
        memoryCache.clear();
    },

    /**
     * Clear all Supabase cache
     */
    async clearDatabase(): Promise<void> {
        if (isSupabaseConfigured()) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('market_data_cache') as any).delete().neq('id', '');
        }
    },
};

/**
 * Higher-order function to add caching to data fetchers
 */
export function withCache<T, Args extends unknown[]>(
    fetcher: (...args: Args) => Promise<DataResponse<T>>,
    keyGenerator: (...args: Args) => string,
    ttlSeconds: number
): (...args: Args) => Promise<DataResponse<T>> {
    return async (...args: Args): Promise<DataResponse<T>> => {
        const key = keyGenerator(...args);

        // Try cache first
        const cached = await cache.get<T>(key);
        if (cached !== null) {
            return {
                data: cached,
                cached: true,
                timestamp: Date.now(),
                source: 'cache',
            };
        }

        // Fetch fresh data
        const result = await fetcher(...args);

        // Cache the result
        await cache.set(key, result.data, ttlSeconds);

        return result;
    };
}
