/**
 * Data Provider Factory & Context
 * 
 * Creates the appropriate data provider based on configuration.
 * Provides React context for app-wide data access.
 */

import { PolygonProvider } from './polygon-provider';
import { MockProvider } from './mock-provider';
import type { MarketDataProvider, ProviderConfig, ProviderType } from './provider';

/**
 * Creates a data provider instance based on configuration
 */
export function createProvider(config: ProviderConfig): MarketDataProvider {
    switch (config.type) {
        case 'polygon':
            if (!config.apiKey) {
                console.warn('No API key provided, falling back to mock provider');
                return new MockProvider();
            }
            return new PolygonProvider(config);

        case 'mock':
        default:
            return new MockProvider();
    }
}

/**
 * Determines provider type from environment
 */
export function getProviderTypeFromEnv(): ProviderType {
    const dataMode = process.env.NEXT_PUBLIC_DATA_MODE || 'mock';
    return dataMode === 'live' ? 'polygon' : 'mock';
}

/**
 * Creates provider from environment variables
 */
export function createProviderFromEnv(): MarketDataProvider {
    const type = getProviderTypeFromEnv();
    const apiKey = process.env.POLYGON_API_KEY;
    const rateLimit = parseInt(process.env.POLYGON_RATE_LIMIT || '5', 10);

    return createProvider({ type, apiKey, rateLimit });
}

// Export all data types and providers
export * from './types';
export * from './provider';
export { PolygonProvider } from './polygon-provider';
export { MockProvider } from './mock-provider';
export { RateLimiter, getGlobalRateLimiter } from './rate-limiter';
