/**
 * Cron Auth Tests
 *
 * Locks the auth contract:
 *   - Feature flag disabled → CRON_AUTH_FLAG_DISABLED
 *   - Secret not configured → CRON_AUTH_MISSING_SECRET
 *   - Header missing → CRON_AUTH_MISSING_HEADER
 *   - Wrong header → CRON_AUTH_INVALID
 *   - Correct header → CRON_AUTH_OK
 *   - getCronHeaderExample returns correct shape
 */

import { NextRequest } from 'next/server';
import { validateCronRequest, getCronHeaderExample } from '../cron-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers?: Record<string, string>): NextRequest {
    const req = new NextRequest('http://localhost:3000/api/cron/test', {
        headers: headers ?? {},
    });
    return req;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cron Auth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // -----------------------------------------------------------------------
    // Feature flag disabled
    // -----------------------------------------------------------------------
    it('returns CRON_AUTH_FLAG_DISABLED when feature flag is not "true"', () => {
        // Flag not set at all
        delete process.env.CRON_TEST_ENABLED;
        process.env.CRON_SECRET = 'my-secret';

        const result = validateCronRequest(makeRequest({
            authorization: 'Bearer my-secret',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(false);
        expect(result.code).toBe('CRON_AUTH_FLAG_DISABLED');
    });

    it('returns CRON_AUTH_FLAG_DISABLED when feature flag is "false"', () => {
        process.env.CRON_TEST_ENABLED = 'false';
        process.env.CRON_SECRET = 'my-secret';

        const result = validateCronRequest(makeRequest({
            authorization: 'Bearer my-secret',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(false);
        expect(result.code).toBe('CRON_AUTH_FLAG_DISABLED');
    });

    // -----------------------------------------------------------------------
    // Secret not configured
    // -----------------------------------------------------------------------
    it('returns CRON_AUTH_MISSING_SECRET when CRON_SECRET is not set', () => {
        process.env.CRON_TEST_ENABLED = 'true';
        delete process.env.CRON_SECRET;

        const result = validateCronRequest(makeRequest({
            authorization: 'Bearer anything',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(false);
        expect(result.code).toBe('CRON_AUTH_MISSING_SECRET');
        // SAFETY: reason must not echo the expected secret
        expect(result.reason).not.toContain('anything');
    });

    // -----------------------------------------------------------------------
    // Header missing
    // -----------------------------------------------------------------------
    it('returns CRON_AUTH_MISSING_HEADER when no Authorization header', () => {
        process.env.CRON_TEST_ENABLED = 'true';
        process.env.CRON_SECRET = 'my-secret';

        const result = validateCronRequest(makeRequest(), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(false);
        expect(result.code).toBe('CRON_AUTH_MISSING_HEADER');
        // SAFETY: reason must not echo the expected secret
        expect(result.reason).not.toContain('my-secret');
    });

    // -----------------------------------------------------------------------
    // Wrong header
    // -----------------------------------------------------------------------
    it('returns CRON_AUTH_INVALID when token does not match', () => {
        process.env.CRON_TEST_ENABLED = 'true';
        process.env.CRON_SECRET = 'correct-secret';

        const result = validateCronRequest(makeRequest({
            authorization: 'Bearer wrong-secret',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(false);
        expect(result.code).toBe('CRON_AUTH_INVALID');
        // SAFETY: reason must not echo the expected secret
        expect(result.reason).not.toContain('correct-secret');
        expect(result.reason).not.toContain('wrong-secret');
    });

    // -----------------------------------------------------------------------
    // Correct header
    // -----------------------------------------------------------------------
    it('returns CRON_AUTH_OK with correct flag + header', () => {
        process.env.CRON_TEST_ENABLED = 'true';
        process.env.CRON_SECRET = 'my-secret-value';

        const result = validateCronRequest(makeRequest({
            authorization: 'Bearer my-secret-value',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(true);
        expect(result.code).toBe('CRON_AUTH_OK');
    });

    it('handles Bearer prefix case-insensitively', () => {
        process.env.CRON_TEST_ENABLED = 'true';
        process.env.CRON_SECRET = 'my-secret';

        const result = validateCronRequest(makeRequest({
            authorization: 'bearer my-secret',
        }), 'CRON_TEST_ENABLED');

        expect(result.authorized).toBe(true);
        expect(result.code).toBe('CRON_AUTH_OK');
    });

    // -----------------------------------------------------------------------
    // getCronHeaderExample
    // -----------------------------------------------------------------------
    describe('getCronHeaderExample', () => {
        it('returns correct header shape without any actual secrets', () => {
            const example = getCronHeaderExample();

            expect(example.headerName).toBe('Authorization');
            expect(example.format).toBe('Bearer <CRON_SECRET>');
            expect(example.envVar).toBe('CRON_SECRET');
            expect(example.featureFlags).toContain('CRON_INTRADAY_SYNC_ENABLED');
            expect(example.featureFlags).toContain('CRON_POST_CLOSE_ENABLED');
            expect(example.featureFlags).toContain('CRON_DAILY_CHECK_ENABLED');
            expect(example.featureFlags).toContain('CRON_BROKER_SYNC_ENABLED');
        });
    });
});
