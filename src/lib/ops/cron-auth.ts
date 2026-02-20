/**
 * Cron Auth — Shared Vercel Cron Authorization
 *
 * Validates CRON_SECRET from Authorization header and
 * per-route feature flags.
 *
 * All cron routes should use this for consistent auth + gating.
 */

import { NextRequest } from 'next/server';

export interface CronAuthResult {
    authorized: boolean;
    reason?: string;
}

/**
 * Validate a cron request:
 * 1. Check feature flag (env var must be "true")
 * 2. Check Authorization: Bearer <CRON_SECRET>
 *
 * @param request - incoming request
 * @param featureFlagEnv - env var name for the feature flag
 */
export function validateCronRequest(
    request: NextRequest,
    featureFlagEnv: string,
): CronAuthResult {
    // Feature flag check
    if (process.env[featureFlagEnv] !== 'true') {
        return { authorized: false, reason: `Feature flag ${featureFlagEnv} not enabled` };
    }

    // CRON_SECRET check
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return { authorized: false, reason: 'CRON_SECRET not configured' };
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return { authorized: false, reason: 'Missing Authorization header' };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token !== cronSecret) {
        return { authorized: false, reason: 'Invalid cron secret' };
    }

    return { authorized: true };
}
