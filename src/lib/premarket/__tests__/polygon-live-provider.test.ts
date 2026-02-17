/**
 * Polygon Live Provider Tests
 * 
 * Tests for real Polygon API integration with proper mocking.
 */

import {
    getEffectiveBaseUrl,
    getEffectiveProvider,
    isPremarketHours,
    isMarketHours,
    fetchPolygonSnapshot,
    getLiveProviderDiagnostics,
} from '../polygon-live-provider';

// =============================================================================
// Mocking
// =============================================================================

// Store original env values
const originalEnv = { ...process.env };

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
    // Reset mocks
    mockFetch.mockReset();
    // Reset env
    process.env = { ...originalEnv };
});

afterAll(() => {
    process.env = originalEnv;
});

// =============================================================================
// Base URL Selection Tests
// =============================================================================

describe('getEffectiveBaseUrl', () => {
    it('returns https://api.polygon.io when no env override', () => {
        delete process.env.MASSIVE_BASE_URL;
        const url = getEffectiveBaseUrl();
        expect(url).toBe('https://api.polygon.io');
    });

    it('returns MASSIVE_BASE_URL when set', () => {
        process.env.MASSIVE_BASE_URL = 'https://custom.api.example.com';
        const url = getEffectiveBaseUrl();
        expect(url).toBe('https://custom.api.example.com');
    });

    it('never returns api.massive.cloud (hardcoded fake URL)', () => {
        delete process.env.MASSIVE_BASE_URL;
        const url = getEffectiveBaseUrl();
        expect(url).not.toContain('api.massive.cloud');
    });
});

// =============================================================================
// Provider Selection Tests
// =============================================================================

describe('getEffectiveProvider', () => {
    it('returns "none" when no keys configured', () => {
        delete process.env.MASSIVE_API_KEY;
        delete process.env.POLYGON_API_KEY;
        expect(getEffectiveProvider()).toBe('none');
    });

    it('returns "massive" when MASSIVE_API_KEY is set', () => {
        process.env.MASSIVE_API_KEY = 'test_key';
        delete process.env.POLYGON_API_KEY;
        expect(getEffectiveProvider()).toBe('massive');
    });

    it('returns "polygon" when only POLYGON_API_KEY is set', () => {
        delete process.env.MASSIVE_API_KEY;
        process.env.POLYGON_API_KEY = 'test_key';
        expect(getEffectiveProvider()).toBe('polygon');
    });

    it('prefers MASSIVE over POLYGON when both set', () => {
        process.env.MASSIVE_API_KEY = 'massive_key';
        process.env.POLYGON_API_KEY = 'polygon_key';
        expect(getEffectiveProvider()).toBe('massive');
    });
});

// =============================================================================
// Premarket Time Window Tests
// =============================================================================

describe('isPremarketHours', () => {
    it('returns true during premarket (6:00 AM ET)', () => {
        // January 30, 2026, 6:00 AM ET = 11:00 UTC
        const date = new Date('2026-01-30T11:00:00Z');
        expect(isPremarketHours(date)).toBe(true);
    });

    it('returns true at 4:00 AM ET (start of premarket)', () => {
        // 4:00 AM ET = 9:00 UTC
        const date = new Date('2026-01-30T09:00:00Z');
        expect(isPremarketHours(date)).toBe(true);
    });

    it('returns false at 9:30 AM ET (market open)', () => {
        // 9:30 AM ET = 14:30 UTC
        const date = new Date('2026-01-30T14:30:00Z');
        expect(isPremarketHours(date)).toBe(false);
    });

    it('returns false at 10:00 AM ET (during regular hours)', () => {
        // 10:00 AM ET = 15:00 UTC
        const date = new Date('2026-01-30T15:00:00Z');
        expect(isPremarketHours(date)).toBe(false);
    });

    it('returns false at 3:00 AM ET (before premarket)', () => {
        // 3:00 AM ET = 8:00 UTC
        const date = new Date('2026-01-30T08:00:00Z');
        expect(isPremarketHours(date)).toBe(false);
    });
});

describe('isMarketHours', () => {
    it('returns true at 10:00 AM ET', () => {
        // 10:00 AM ET = 15:00 UTC
        const date = new Date('2026-01-30T15:00:00Z');
        expect(isMarketHours(date)).toBe(true);
    });

    it('returns false at 6:00 AM ET (premarket)', () => {
        // 6:00 AM ET = 11:00 UTC
        const date = new Date('2026-01-30T11:00:00Z');
        expect(isMarketHours(date)).toBe(false);
    });

    it('returns false at 5:00 PM ET (after hours)', () => {
        // 5:00 PM ET = 22:00 UTC
        const date = new Date('2026-01-30T22:00:00Z');
        expect(isMarketHours(date)).toBe(false);
    });
});

// =============================================================================
// Snapshot Fetch Tests
// =============================================================================

describe('fetchPolygonSnapshot', () => {
    beforeEach(() => {
        process.env.MASSIVE_API_KEY = 'test_api_key';
    });

    it('returns error when no API key configured', async () => {
        delete process.env.MASSIVE_API_KEY;
        delete process.env.POLYGON_API_KEY;

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe('NO_API_KEY');
    });

    it('parses prevClose from prevDay.c', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({
                status: 'OK',
                ticker: {
                    ticker: 'AAPL',
                    prevDay: { c: 185.50 },
                    day: { o: 186.00 },
                    lastTrade: { p: 186.25 },
                },
            }),
        });

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.prevClose).toBe(185.50);
        expect(result.error).toBeUndefined();
    });

    it('parses open from day.o', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({
                status: 'OK',
                ticker: {
                    ticker: 'AAPL',
                    prevDay: { c: 185.50 },
                    day: { o: 186.00 },
                },
            }),
        });

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.open).toBe(186.00);
    });

    it('parses lastPrice from lastTrade.p', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({
                status: 'OK',
                ticker: {
                    ticker: 'AAPL',
                    prevDay: { c: 185.50 },
                    lastTrade: { p: 186.25 },
                },
            }),
        });

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.lastPrice).toBe(186.25);
    });

    it('captures HTTP error with status and messagePreview', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({
                status: 'ERROR',
                error: 'Not authorized. Your API key is invalid or expired.',
            }),
        });

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe('HTTP_403');
        expect(result.error?.messagePreview).toContain('Not authorized');
    });

    it('captures fetch error with messagePreview', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await fetchPolygonSnapshot('AAPL');

        expect(result.error).toBeDefined();
        expect(result.error?.status).toBe('FETCH_ERROR');
        expect(result.error?.messagePreview).toContain('Network timeout');
    });
});

// =============================================================================
// Diagnostics Tests
// =============================================================================

describe('getLiveProviderDiagnostics', () => {
    it('includes effectiveBaseUrl from env', () => {
        delete process.env.MASSIVE_BASE_URL;
        const diag = getLiveProviderDiagnostics();
        expect(diag.effectiveBaseUrl).toBe('https://api.polygon.io');
    });

    it('includes key availability flags', () => {
        process.env.MASSIVE_API_KEY = 'test';
        delete process.env.POLYGON_API_KEY;

        const diag = getLiveProviderDiagnostics();

        expect(diag.hasMassiveKey).toBe(true);
        expect(diag.hasPolygonKey).toBe(false);
    });

    it('includes time window indicators', () => {
        const diag = getLiveProviderDiagnostics();

        expect(typeof diag.isPremarketHours).toBe('boolean');
        expect(typeof diag.isMarketHours).toBe('boolean');
        expect(typeof diag.currentTimeET).toBe('string');
    });
});
