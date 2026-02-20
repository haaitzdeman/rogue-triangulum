/**
 * Cron Auth — Shared Vercel Cron Authorization
 *
 * Validates CRON_SECRET from Authorization header and
 * per-route feature flags.
 *
 * CONTRACT:
 *   ENV VAR   : CRON_SECRET (any string, ≥16 chars recommended)
 *   HEADER    : Authorization: Bearer <CRON_SECRET>
 *   FLAGS     : Per-route env var must be "true" to enable
 *
 * SAFETY:
 *   - Never echoes the expected secret value
 *   - All failures return a safe diagnostic code + 404 behavior
 *   - Unauthorized requests always result in 404 from the route handler
 */

import { NextRequest } from 'next/server';

// =============================================================================
// Types
// =============================================================================

/** Safe diagnostic codes — never contain secret values */
export type CronAuthCode =
    | 'CRON_AUTH_FLAG_DISABLED'
    | 'CRON_AUTH_MISSING_SECRET'
    | 'CRON_AUTH_MISSING_HEADER'
    | 'CRON_AUTH_INVALID'
    | 'CRON_AUTH_OK';

export interface CronAuthResult {
    authorized: boolean;
    code: CronAuthCode;
    reason?: string;
}

// =============================================================================
// Validate
// =============================================================================

/**
 * Validate a cron request in order:
 * 1. Feature flag env var must be "true"
 * 2. CRON_SECRET env var must be set
 * 3. Authorization: Bearer <token> header must match CRON_SECRET
 *
 * All cron routes use this. Unauthorized → caller returns 404.
 */
export function validateCronRequest(
    request: NextRequest,
    featureFlagEnv: string,
): CronAuthResult {
    // 1. Feature flag
    if (process.env[featureFlagEnv] !== 'true') {
        return {
            authorized: false,
            code: 'CRON_AUTH_FLAG_DISABLED',
            reason: `${featureFlagEnv} is not "true"`,
        };
    }

    // 2. CRON_SECRET must exist
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return {
            authorized: false,
            code: 'CRON_AUTH_MISSING_SECRET',
            reason: 'Server-side CRON_SECRET env var is not set',
        };
    }

    // 3. Authorization header must exist
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return {
            authorized: false,
            code: 'CRON_AUTH_MISSING_HEADER',
            reason: 'Request missing Authorization header. Expected: Authorization: Bearer <secret>',
        };
    }

    // 4. Token must match (strip "Bearer " prefix)
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token !== cronSecret) {
        return {
            authorized: false,
            code: 'CRON_AUTH_INVALID',
            reason: 'Authorization token does not match CRON_SECRET',
        };
    }

    return { authorized: true, code: 'CRON_AUTH_OK' };
}

// =============================================================================
// Helper — Header shape for docs/tests (never includes the actual secret)
// =============================================================================

/**
 * Returns the expected header shape for documentation and testing.
 * Never includes the actual secret value.
 *
 * Example output:
 *   { headerName: "Authorization", format: "Bearer <CRON_SECRET>" }
 */
export function getCronHeaderExample(): {
    headerName: string;
    format: string;
    envVar: string;
    featureFlags: string[];
} {
    return {
        headerName: 'Authorization',
        format: 'Bearer <CRON_SECRET>',
        envVar: 'CRON_SECRET',
        featureFlags: [
            'CRON_INTRADAY_SYNC_ENABLED',
            'CRON_POST_CLOSE_ENABLED',
            'CRON_DAILY_CHECK_ENABLED',
            'CRON_BROKER_SYNC_ENABLED',
        ],
    };
}
