/**
 * Admin Gate
 *
 * Shared auth check for admin-only API routes.
 * Requires either:
 *   - ADMIN_TOKEN header matching env ADMIN_TOKEN
 *   - ADMIN_MODE=true env var (dev convenience)
 *
 * Never exposes Alpaca keys or other secrets.
 */

import { NextRequest } from 'next/server';

export interface AdminAuthResult {
    authorized: boolean;
    reason?: string;
}

export function checkAdminAuth(request: NextRequest): AdminAuthResult {
    // Dev convenience: ADMIN_MODE env flag
    if (process.env.ADMIN_MODE === 'true') {
        return { authorized: true };
    }

    // Production: check ADMIN_TOKEN header
    const token = request.headers.get('x-admin-token');
    const expected = process.env.ADMIN_TOKEN;

    if (!expected) {
        return {
            authorized: false,
            reason: 'ADMIN_TOKEN not configured on server',
        };
    }

    if (!token) {
        return {
            authorized: false,
            reason: 'Missing x-admin-token header',
        };
    }

    if (token !== expected) {
        return {
            authorized: false,
            reason: 'Invalid admin token',
        };
    }

    return { authorized: true };
}
